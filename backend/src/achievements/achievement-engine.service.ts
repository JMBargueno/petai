import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { StatsService, StatsChangedEvent } from '../stats/stats.service';
import { AchievementRewardsService } from './achievement-rewards.service';

/** Disparador de un logro (ver `achievementTriggerSchema` en game-data.schemas.ts). */
export type AchievementTrigger =
  | { type: 'event'; event: string }
  | { type: 'stat'; stat: string }
  | { type: 'all_stats'; stats: string[]; min?: number }
  | { type: 'account_before'; date: string };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  category: string;
  target: number;
  event?: string;
  trigger?: AchievementTrigger;
  tier: string;
  badge?: { icon: string };
  hidden?: boolean;
  reward: { coins: number; gems: number; xp: number; itemId: string | null };
}

/** Disparador efectivo: el formato antiguo (`event`) equivale a `{ type: 'event' }`. */
export function triggerOf(def: AchievementDef): AchievementTrigger {
  return def.trigger ?? { type: 'event', event: def.event ?? '' };
}

/** Estadísticas de las que depende un logro (vacío para eventos y `account_before`). */
export function statKeysOf(def: AchievementDef): string[] {
  const t = triggerOf(def);
  if (t.type === 'stat') return [t.stat];
  if (t.type === 'all_stats') return t.stats;
  return [];
}

export interface ProgressContext {
  stats: Record<string, number>;
  createdAt: Date | null;
}

/** Progreso de un logro NO basado en eventos (los de evento usan la fila `Achievement.current`). */
export function computeProgress(def: AchievementDef, ctx: ProgressContext): number {
  const t = triggerOf(def);
  switch (t.type) {
    case 'stat':
      return Math.max(0, ctx.stats[t.stat] ?? 0);
    case 'all_stats': {
      const min = t.min ?? 1;
      return t.stats.filter((s) => (ctx.stats[s] ?? 0) >= min).length;
    }
    case 'account_before':
      return ctx.createdAt && ctx.createdAt.getTime() < Date.parse(`${t.date}T00:00:00Z`) ? def.target : 0;
    default:
      return 0;
  }
}

const EVAL_THROTTLE_SECONDS = 600;

/**
 * Motor centralizado de logros. Los logros de evento (contadores) siguen en
 * `AchievementTrackingService`; este servicio evalúa el resto a partir de las estadísticas
 * (`StatsService`) y de los datos de la cuenta, y delega el desbloqueo atómico + recompensa +
 * notificación WS en `AchievementRewardsService` (idempotente: nunca se paga dos veces).
 *
 * Se evalúa cuando cambia una estadística (`stats:changed`), al leer el perfil y, con throttle, al
 * abrir la app (`GET /me`), que es lo que desbloquea los logros derivados (beta tester, días PRO).
 */
@Injectable()
export class AchievementEngineService {
  private readonly logger = new Logger(AchievementEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly stats: StatsService,
    private readonly rewards: AchievementRewardsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  getDefs(): AchievementDef[] {
    const data = this.gameData.getAchievements();
    return Array.isArray(data?.achievements) ? (data.achievements as AchievementDef[]) : [];
  }

  /** Contexto de progreso (estadísticas + fecha de alta) del usuario. */
  async loadContext(userId: string): Promise<ProgressContext> {
    const [stats, user] = await Promise.all([
      this.stats.getAll(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    ]);
    return { stats, createdAt: user?.createdAt ?? null };
  }

  @OnEvent('stats:changed', { async: true })
  async onStatsChanged(p: StatsChangedEvent) {
    try {
      await this.evaluate(p.userId, undefined, p.keys);
    } catch (err) {
      this.logger.error(`Fallo evaluando logros de ${p.userId}: ${(err as Error).message}`);
    }
  }

  /** Igual que `evaluate`, pero como mucho una vez cada 10 min por usuario (si hay Redis). */
  async evaluateThrottled(userId: string): Promise<void> {
    if (this.redis) {
      const ok = await this.redis.run(
        (r) => r.set(this.redis!.key(`ach:eval:${userId}`), '1', 'EX', EVAL_THROTTLE_SECONDS, 'NX'),
        'ach_eval_throttle',
      );
      if (ok === null) return; // ya evaluado hace poco (o Redis caído: no insistir en cada /me)
    }
    try {
      await this.evaluate(userId);
    } catch (err) {
      this.logger.warn(`Evaluación de logros aplazada para ${userId}: ${(err as Error).message}`);
    }
  }

  /**
   * Evalúa todos los logros no basados en eventos que el usuario aún no tiene y desbloquea los que
   * ya cumplen. Devuelve los ids recién desbloqueados.
   */
  async evaluate(userId: string, ctx?: ProgressContext, changedKeys?: string[]): Promise<string[]> {
    let defs = this.getDefs().filter((d) => triggerOf(d).type !== 'event');
    // Si se sabe qué estadísticas cambiaron, solo se evalúan los logros que dependen de ellas (los
    // ticks de presencia llegan cada 30s: así no se recalculan las derivadas en cada uno).
    if (changedKeys) defs = defs.filter((d) => statKeysOf(d).some((k) => changedKeys.includes(k)));
    if (defs.length === 0) return [];

    const unlockedRows = await this.prisma.achievement.findMany({
      where: { userId, unlockedAt: { not: null } },
      select: { achId: true },
    });
    const unlocked = new Set(unlockedRows.map((r) => r.achId));
    const pending = defs.filter((d) => !unlocked.has(d.id));
    if (pending.length === 0) return [];

    const context = ctx ?? (await this.loadContext(userId));
    const newly: string[] = [];
    for (const def of pending) {
      if (computeProgress(def, context) < def.target) continue;
      try {
        // La condición de desbloqueo atómica de `unlockAndGrant` exige `current >= target`.
        await this.prisma.achievement.upsert({
          where: { userId_achId: { userId, achId: def.id } },
          update: { current: def.target },
          create: { userId, achId: def.id, current: def.target },
        });
        const payload = await this.rewards.unlockAndGrant(userId, def.id);
        if (payload) {
          this.rewards.emitUnlocked(userId, payload);
          newly.push(def.id);
        }
      } catch (err) {
        this.logger.error(`No se pudo desbloquear ${def.id} para ${userId}: ${(err as Error).message}`);
      }
    }
    return newly;
  }
}
