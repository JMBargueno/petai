import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { RedisService } from '../redis/redis.service';
import { AchievementRewardsService } from './achievement-rewards.service';

interface AchievementDef {
  id: string;
  target: number;
  event: string;
}

/**
 * Tracking de progreso de logros (feature 008 / US2): escucha eventos de dominio y incrementa
 * `current` de los logros activos del usuario. Reutiliza el mismo mecanismo de `@OnEvent` que
 * `MissionTrackingService` y NO bloquea la acción principal (se procesa de forma asíncrona).
 *
 * El contador en caliente vive en Redis (`ach:progress:{userId}:{achId}`) con flush ~30s a
 * PostgreSQL; si Redis no está disponible se opera directamente sobre PostgreSQL (fallback —
 * Redis es acelerante, no requisito).
 */
@Injectable()
export class AchievementTrackingService implements OnModuleDestroy {
  private readonly logger = new Logger(AchievementTrackingService.name);
  private readonly FLUSH_MS = 30_000;
  private readonly HOT_TTL_SECONDS = 60;
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly redis: RedisService,
    private readonly rewards: AchievementRewardsService,
  ) {}

  // ---------- Listeners de eventos de dominio ----------

  @OnEvent('pet:fed')
  async onPetFed(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['pet:fed']);
  }

  @OnEvent('pet:cleaned')
  async onPetCleaned(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['pet:cleaned']);
  }

  @OnEvent('pet:slept')
  async onPetSlept(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['pet:slept']);
  }

  @OnEvent('pet:evolved')
  async onPetEvolved(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['pet:evolved']);
  }

  @OnEvent('pet:level_up')
  async onPetLevelUp(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['pet:level_up']);
  }

  @OnEvent('egg:hatched')
  async onEggHatched(payload: { userId: string; rarity?: string }) {
    await this.handleEvents(payload.userId, ['egg:hatched']);
  }

  @OnEvent('battle:finished')
  async onBattleFinished(payload: { userId: string; won?: boolean }) {
    const keys = ['battle:finished'];
    if (payload.won) keys.push('battle_win');
    await this.handleEvents(payload.userId, keys);
  }

  @OnEvent('minigame:finished')
  async onMinigameFinished(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['minigame:finished']);
  }

  @OnEvent('chat:message_sent')
  async onChatMessageSent(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['chat:message_sent']);
  }

  @OnEvent('social:constellation_shared')
  async onConstellationShared(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['social:constellation_shared']);
  }

  @OnEvent('social:public_profile')
  async onPublicProfile(payload: { userId: string }) {
    await this.handleEvents(payload.userId, ['social:public_profile']);
  }

  onModuleDestroy() {
    for (const t of this.flushTimers.values()) clearTimeout(t);
    this.flushTimers.clear();
  }

  /** Logros data-driven que matchean el `event` dado. */
  private matchedDefs(eventKeys: string[]): AchievementDef[] {
    const data = this.gameData.getAchievements();
    if (!data || !Array.isArray(data.achievements)) return [];
    return (data.achievements as AchievementDef[]).filter((d) => eventKeys.includes(d.event));
  }

  /** Itera los logros afectados y los incrementa (uno por evento de dominio). */
  private async handleEvents(userId: string, eventKeys: string[]): Promise<void> {
    for (const def of this.matchedDefs(eventKeys)) {
      try {
        await this.processAchievement(userId, def);
      } catch (err: any) {
        // No bloquear la acción principal ni otros logros: se registra y se sigue.
        this.logger.error(`Fallo al actualizar logro ${def.id} para ${userId}: ${err?.message}`);
      }
    }
  }

  /**
   * Incrementa el progreso de un logro activo. Si al incrementar se alcanza `target`, se flusha a
   * PG, se delega el desbloqueo/recompensa a `AchievementRewardsService` (US3) y se emite
   * `achievement:unlocked` por WS. Un logro ya desbloqueado se ignora (único, no repetible).
   */
  private async processAchievement(userId: string, def: AchievementDef): Promise<void> {
    const row = await this.prisma.achievement.findUnique({
      where: { userId_achId: { userId, achId: def.id } },
      select: { current: true, unlockedAt: true },
    });
    if (row?.unlockedAt) return; // ya desbloqueado
    if ((row?.current ?? 0) >= def.target) return; // ya alcanzado

    const newCurrent = await this.bump(userId, def);

    if (newCurrent >= def.target) {
      await this.flushToPg(userId, def.id);
      const payload = await this.rewards.unlockAndGrant(userId, def.id);
      if (payload) this.rewards.emitUnlocked(userId, payload);
    }
  }

  /**
   * Incrementa el contador en caliente de un logro. Usa Redis (`INCRBY`) si está disponible y
   * programá el flush; si no, opera directamente sobre PostgreSQL (fallback).
   */
  private async bump(userId: string, def: AchievementDef): Promise<number> {
    const key = `ach:progress:${userId}:${def.id}`;
    const inc = await this.redis.run((r) => r.incrby(key, 1), 'incrby');
    if (inc !== null) {
      await this.redis.run((r) => r.expire(key, this.HOT_TTL_SECONDS), 'expire');
      this.scheduleFlush(userId, def.id);
      return inc;
    }

    // Fallback: Redis no disponible → incremento atómico en PostgreSQL.
    const upserted = await this.prisma.achievement.upsert({
      where: { userId_achId: { userId, achId: def.id } },
      update: { current: { increment: 1 } },
      create: { userId, achId: def.id, current: 1 },
      select: { current: true },
    });
    return upserted.current;
  }

  /** Programá un flush diferido (~30s) del contador en caliente de un logro a PostgreSQL. */
  private scheduleFlush(userId: string, achId: string): void {
    const id = `${userId}:${achId}`;
    const existing = this.flushTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.flushTimers.delete(id);
      void this.flushToPg(userId, achId);
    }, this.FLUSH_MS);
    timer.unref?.();
    this.flushTimers.set(id, timer);
  }

  /**
   * Persiste el valor del contador en caliente (Redis) en PostgreSQL y limpia la clave. Si no hay
   * valor en Redis (por ejemplo, se usó el fallback PG), no hace nada.
   */
  async flushToPg(userId: string, achId: string): Promise<void> {
    const timerId = `${userId}:${achId}`;
    const timer = this.flushTimers.get(timerId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(timerId);
    }
    const key = `ach:progress:${userId}:${achId}`;
    const val = await this.redis.run((r) => r.get(key), 'get');
    if (val === null || val === undefined) return; // sin valor en caliente (fallback ya en PG)
    const current = Number(val);
    if (!Number.isFinite(current)) return;
    await this.prisma.achievement.upsert({
      where: { userId_achId: { userId, achId } },
      update: { current },
      create: { userId, achId, current },
    });
    await this.redis.run((r) => r.del(key), 'del');
  }
}
