import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService, dayNumber } from './stats.service';

/** Payload de `egg:hatched` (lo emite `HatchingService.hatchEgg`). */
export interface EggHatchedEvent {
  userId: string;
  petId?: string;
  rarity?: string;
  element?: string;
  shiny?: boolean;
  eggType?: string;
}

const TZ_CACHE_MS = 10 * 60 * 1000;

/**
 * Traduce eventos de dominio a estadísticas (`UserStat`). No bloquea la acción original: los fallos se
 * registran y se ignoran (las estadísticas son best-effort, igual que el tracking de misiones).
 */
@Injectable()
export class StatsListener {
  private readonly logger = new Logger(StatsListener.name);
  /** Último día (YYYYMMDD) ya registrado por usuario en esta réplica: evita consultas en cada tick. */
  private readonly touchedDay = new Map<string, number>();
  private readonly tzCache = new Map<string, { tz: string | null; at: number }>();

  constructor(
    private readonly stats: StatsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('pet:fed', { async: true })
  onFed(p: { userId: string }) {
    return this.safe(() => this.stats.increment(p.userId, 'feeds'));
  }

  @OnEvent('pet:cleaned', { async: true })
  onCleaned(p: { userId: string }) {
    return this.safe(() => this.stats.increment(p.userId, 'cleans'));
  }

  @OnEvent('pet:slept', { async: true })
  onSlept(p: { userId: string }) {
    return this.safe(() => this.stats.increment(p.userId, 'sleeps'));
  }

  @OnEvent('egg:hatched', { async: true })
  onHatched(p: EggHatchedEvent) {
    const deltas: Record<string, number> = { eggs_hatched: 1 };
    if (p.rarity) deltas[`hatched_${p.rarity}`] = 1;
    if (p.element) deltas[`hatched_el_${p.element}`] = 1;
    if (p.shiny) deltas.hatched_shiny = 1;
    return this.safe(() => this.stats.incrementMany(p.userId, deltas));
  }

  /** Cría (breeding): cuenta como pockai conseguido, pero no como huevo abierto. */
  @OnEvent('pet:bred', { async: true })
  onBred(p: EggHatchedEvent) {
    const deltas: Record<string, number> = {};
    if (p.rarity) deltas[`hatched_${p.rarity}`] = 1;
    if (p.element) deltas[`hatched_el_${p.element}`] = 1;
    if (p.shiny) deltas.hatched_shiny = 1;
    return this.safe(() => this.stats.incrementMany(p.userId, deltas));
  }

  @OnEvent('habitat:visited', { async: true })
  onHabitatVisited(p: { userId: string }) {
    return this.safe(() => this.stats.increment(p.userId, 'habitat_visits'));
  }

  /** `friends` es derivada: solo hay que avisar al motor para que re-evalúe a ambos usuarios. */
  @OnEvent('coop:friendship_accepted', { async: true })
  onFriendshipAccepted(p: { userIds: string[] }) {
    for (const id of p.userIds ?? []) this.stats.emitChanged(id, ['friends']);
  }

  /** Tick de presencia (cada ~30s por socket conectado): tiempo de juego y racha diaria. */
  @OnEvent('presence:tick', { async: true })
  async onPresenceTick(p: { userId: string }) {
    await this.safe(() => this.stats.addPlayTime(p.userId));
    await this.safe(() => this.touchDay(p.userId));
  }

  private async touchDay(userId: string) {
    const tz = await this.timezoneOf(userId);
    const today = dayNumber(new Date(), tz);
    if (this.touchedDay.get(userId) === today) return;
    await this.stats.touchPlayDay(userId, tz);
    this.touchedDay.set(userId, today);
    if (this.touchedDay.size > 50_000) this.touchedDay.clear();
  }

  private async timezoneOf(userId: string): Promise<string | null> {
    const hit = this.tzCache.get(userId);
    if (hit && Date.now() - hit.at < TZ_CACHE_MS) return hit.tz;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const tz = u?.timezone ?? null;
    this.tzCache.set(userId, { tz, at: Date.now() });
    if (this.tzCache.size > 50_000) this.tzCache.clear();
    return tz;
  }

  private async safe(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`No se pudo actualizar una estadística: ${(err as Error).message}`);
    }
  }
}
