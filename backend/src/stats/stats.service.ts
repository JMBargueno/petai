import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { isValidTimeZone } from '../modules/pets/sleep-cycle';

/** Payload del evento interno `stats:changed` (lo consume el motor de logros). */
export interface StatsChangedEvent {
  userId: string;
  keys: string[];
}

/** Máximo hueco entre dos ticks de presencia que se cuenta como juego continuo. */
export const PLAYTIME_MAX_GAP_MS = 45_000;
const PLAYTIME_KEY_TTL_SECONDS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProInfo {
  /** Días totales (enteros) siendo PRO, sumando todas las suscripciones sin solapes. */
  days: number;
  /** Si ahora mismo es PRO. */
  active: boolean;
  /** Inicio del tramo PRO continuo actual (si `active`). */
  since: Date | null;
}

type Tx = Prisma.TransactionClient;

/**
 * Estadísticas acumuladas por usuario (`UserStat`): fuente única del progreso de los logros de tipo
 * `stat` y de los datos del perfil. Todas las escrituras son atómicas (upsert con `increment`) y, si no
 * van dentro de una transacción del llamante, emiten `stats:changed` para que el motor de logros
 * re-evalúe.
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** Incrementa varias estadísticas a la vez y emite un único `stats:changed`. */
  async incrementMany(userId: string, deltas: Record<string, number>): Promise<void> {
    const entries = Object.entries(deltas).filter(([, by]) => Number.isFinite(by) && by > 0);
    if (entries.length === 0) return;
    await this.prisma.$transaction(entries.map(([key, by]) => this.upsertIncrement(this.prisma, userId, key, by)));
    this.emitChanged(userId, entries.map(([k]) => k));
  }

  async increment(userId: string, key: string, by = 1): Promise<void> {
    await this.incrementMany(userId, { [key]: by });
  }

  /**
   * Incremento dentro de la transacción del llamante (p. ej. el gasto de monedas junto al cobro).
   * No emite `stats:changed`: el motor lo recoge en la siguiente evaluación del usuario.
   */
  incrementInTx(tx: Tx, userId: string, key: string, by: number) {
    return this.upsertIncrement(tx, userId, key, by);
  }

  private upsertIncrement(client: Tx | PrismaService, userId: string, key: string, by: number) {
    return client.userStat.upsert({
      where: { userId_key: { userId, key } },
      update: { value: { increment: by } },
      create: { userId, key, value: by },
    });
  }

  async set(userId: string, key: string, value: number): Promise<void> {
    await this.prisma.userStat.upsert({
      where: { userId_key: { userId, key } },
      update: { value },
      create: { userId, key, value },
    });
    this.emitChanged(userId, [key]);
  }

  /** Estadísticas almacenadas del usuario más las derivadas (`pro_days`, `friends`). */
  async getAll(userId: string): Promise<Record<string, number>> {
    const [rows, pro, friends] = await Promise.all([
      this.prisma.userStat.findMany({ where: { userId }, select: { key: true, value: true } }),
      this.getProInfo(userId),
      this.countFriends(userId),
    ]);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.key] = r.value;
    out.pro_days = pro.days;
    out.friends = friends;
    return out;
  }

  emitChanged(userId: string, keys: string[]): void {
    this.events?.emit('stats:changed', { userId, keys } satisfies StatsChangedEvent);
  }

  // ---------- Tiempo de juego ----------

  /**
   * Suma tiempo de juego a partir de los ticks de presencia (cada ~30s mientras el socket está abierto).
   * Se guarda en Redis el instante del último tick del usuario (compartido por todos sus dispositivos):
   * se suma el hueco desde ese tick si es razonable (≤ 45s), así varios dispositivos no cuentan doble y
   * una desconexión larga no suma tiempo. Sin Redis no se cuenta (degradación silenciosa).
   */
  async addPlayTime(userId: string, now = Date.now()): Promise<number> {
    if (!this.redis) return 0;
    const key = this.redis.key(`playtime:last:${userId}`);
    const prev = await this.redis.run(
      async (r) => {
        const old = await r.getset(key, String(now));
        await r.expire(key, PLAYTIME_KEY_TTL_SECONDS);
        return old;
      },
      'playtime',
    );
    if (prev === null || prev === undefined) return 0;
    const delta = now - Number(prev);
    if (!Number.isFinite(delta) || delta <= 0 || delta > PLAYTIME_MAX_GAP_MS) return 0;
    const seconds = Math.round(delta / 1000);
    if (seconds <= 0) return 0;
    await this.increment(userId, 'play_seconds', seconds);
    return seconds;
  }

  // ---------- Racha de días seguidos ----------

  /**
   * Registra que el usuario ha jugado "hoy" (en su zona horaria). La primera vez del día actualiza la
   * racha: +1 si el último día jugado fue ayer, 1 si no. `streak_best` guarda el máximo histórico (es
   * el que evalúan los logros de racha, para que no se pierdan al romperla).
   */
  async touchPlayDay(userId: string, timezone?: string | null, now = new Date()): Promise<boolean> {
    const today = dayNumber(now, timezone);
    const lastRow = await this.prisma.userStat.findUnique({
      where: { userId_key: { userId, key: 'last_play_day' } },
      select: { value: true },
    });
    const last = lastRow?.value ?? 0;
    if (last === today) return false;

    // Reclamo atómico del día: solo una petición concurrente avanza la racha.
    try {
      if (lastRow) {
        const claimed = await this.prisma.userStat.updateMany({
          where: { userId, key: 'last_play_day', value: last },
          data: { value: today },
        });
        if (claimed.count === 0) return false;
      } else {
        await this.prisma.userStat.create({ data: { userId, key: 'last_play_day', value: today } });
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }

    const continues = last !== 0 && last === previousDay(today);
    const current = continues
      ? (
          await this.prisma.userStat.upsert({
            where: { userId_key: { userId, key: 'streak_current' } },
            update: { value: { increment: 1 } },
            create: { userId, key: 'streak_current', value: 1 },
          })
        ).value
      : (
          await this.prisma.userStat.upsert({
            where: { userId_key: { userId, key: 'streak_current' } },
            update: { value: 1 },
            create: { userId, key: 'streak_current', value: 1 },
          })
        ).value;

    // streak_best = max(streak_best, current), de forma atómica.
    await this.prisma.userStat.upsert({
      where: { userId_key: { userId, key: 'streak_best' } },
      update: {},
      create: { userId, key: 'streak_best', value: 0 },
    });
    await this.prisma.userStat.updateMany({
      where: { userId, key: 'streak_best', value: { lt: current } },
      data: { value: current },
    });
    this.emitChanged(userId, ['streak_current', 'streak_best']);
    return true;
  }

  // ---------- Derivadas ----------

  /**
   * Días siendo PRO: une los intervalos de todas las suscripciones `pro` (sin contar solapes entre
   * Stripe y Google Play). Un tramo termina en `currentPeriodEnd` (o en la última actualización si se
   * canceló/expiró/revocó antes) y nunca después de ahora.
   */
  async getProInfo(userId: string, now = new Date()): Promise<ProInfo> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, plan: 'pro' },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        graceUntil: true,
      },
    });
    return computeProInfo(subs, now);
  }

  async countFriends(userId: string): Promise<number> {
    return this.prisma.coopFriendship.count({
      where: { status: 'accepted', OR: [{ ownerId: userId }, { visitorId: userId }] },
    });
  }
}

interface SubLike {
  status: string;
  createdAt: Date;
  updatedAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: Date | null;
}

/** Cálculo puro de los días PRO (exportado para tests). */
export function computeProInfo(subs: SubLike[], now = new Date()): ProInfo {
  const t = now.getTime();
  const intervals: [number, number, boolean][] = [];
  for (const s of subs) {
    const start = s.createdAt.getTime();
    const periodEnd = s.currentPeriodEnd?.getTime() ?? t;
    let end: number;
    let active = false;
    switch (s.status) {
      case 'active':
      case 'trialing':
        end = Math.min(t, periodEnd);
        active = periodEnd > t;
        break;
      case 'past_due': {
        const grace = s.graceUntil?.getTime() ?? periodEnd;
        end = Math.min(t, Math.max(periodEnd, grace));
        active = grace > t;
        break;
      }
      case 'canceled':
        end = s.cancelAtPeriodEnd ? Math.min(t, periodEnd) : Math.min(t, s.updatedAt.getTime(), periodEnd);
        active = s.cancelAtPeriodEnd && periodEnd > t;
        break;
      default: // expired | revoked
        end = Math.min(t, s.updatedAt.getTime(), periodEnd);
    }
    if (end > start) intervals.push([start, end, active]);
  }
  intervals.sort((a, b) => a[0] - b[0]);

  let totalMs = 0;
  let curStart = -1;
  let curEnd = -1;
  let curActive = false;
  let since: Date | null = null;
  const flush = () => {
    if (curStart < 0) return;
    totalMs += curEnd - curStart;
    if (curActive) since = new Date(curStart);
  };
  for (const [s, e, a] of intervals) {
    if (curStart >= 0 && s <= curEnd) {
      curEnd = Math.max(curEnd, e);
      curActive = curActive || a;
    } else {
      flush();
      curStart = s;
      curEnd = e;
      curActive = a;
    }
  }
  flush();
  const active = intervals.some(([, , a]) => a);
  return { days: Math.floor(totalMs / DAY_MS), active, since: active ? since : null };
}

/** Día natural `YYYYMMDD` (entero) en la zona horaria dada (UTC si no es válida). */
export function dayNumber(date: Date, timezone?: string | null): number {
  const tz = timezone && isValidTimeZone(timezone) ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return Number(parts.replace(/-/g, ''));
}

/** Día anterior a un `YYYYMMDD` (calendario gregoriano, sin depender de la zona horaria). */
export function previousDay(day: number): number {
  const y = Math.floor(day / 10000);
  const m = Math.floor((day % 10000) / 100);
  const d = day % 100;
  const prev = new Date(Date.UTC(y, m - 1, d) - DAY_MS);
  return prev.getUTCFullYear() * 10000 + (prev.getUTCMonth() + 1) * 100 + prev.getUTCDate();
}
