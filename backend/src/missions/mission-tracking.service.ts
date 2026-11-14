import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';
import { ChestsService } from '../modules/chests/chests.service';

/**
 * Escucha eventos de dominio y actualiza el progreso de las misiones correspondientes.
 *
 * Mapeo de eventos → tipo de misión:
 * - pet:fed        → feed
 * - pet:cleaned    → clean
 * - pet:slept      → sleep
 * - pet:evolved    → evolve
 * - egg:hatched    → hatch
 * - battle:finished → battle, battle_win (si ganó)
 * - minigame:finished → minigame
 * - chat:message_sent → chat
 * - pet:level_up   → level_up
 */
@Injectable()
export class MissionTrackingService implements OnModuleDestroy {
  private readonly logger = new Logger(MissionTrackingService.name);
  private readonly PROGRESS_THROTTLE_MS = 2000;
  private readonly lastProgressEmit = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly chestsService: ChestsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('pet:fed')
  async onPetFed(payload: { userId: string; petId?: string }) {
    await this.incrementProgress(payload.userId, 'feed', 1);
  }

  @OnEvent('pet:cleaned')
  async onPetCleaned(payload: { userId: string; petId?: string }) {
    await this.incrementProgress(payload.userId, 'clean', 1);
  }

  @OnEvent('pet:slept')
  async onPetSlept(payload: { userId: string; petId?: string }) {
    await this.incrementProgress(payload.userId, 'sleep', 1);
  }

  @OnEvent('pet:evolved')
  async onPetEvolved(payload: { userId: string; petId?: string }) {
    await this.incrementProgress(payload.userId, 'evolve', 1);
  }

  @OnEvent('egg:hatched')
  async onEggHatched(payload: { userId: string; rarity?: string }) {
    await this.incrementProgress(payload.userId, 'hatch', 1);
    if (payload.rarity && ['rare', 'super_rare', 'legendary', 'mythic'].includes(payload.rarity)) {
      await this.incrementProgress(payload.userId, 'hatch_rare', 1);
    }
  }

  @OnEvent('battle:finished')
  async onBattleFinished(payload: { userId: string; won?: boolean; petId?: string }) {
    await this.incrementProgress(payload.userId, 'battle', 1);
    if (payload.won) {
      await this.incrementProgress(payload.userId, 'battle_win', 1);
    }
  }

  @OnEvent('minigame:finished')
  async onMinigameFinished(payload: { userId: string; petId?: string; score?: number }) {
    await this.incrementProgress(payload.userId, 'minigame', 1);
  }

  @OnEvent('chat:message_sent')
  async onChatMessageSent(payload: { userId: string; petId?: string }) {
    await this.incrementProgress(payload.userId, 'chat', 1);
  }

  @OnEvent('pet:level_up')
  async onPetLevelUp(payload: { userId: string; petId?: string }) {
    await this.incrementProgress(payload.userId, 'level_up', 1);
  }

  onModuleDestroy() {
    this.lastProgressEmit.clear();
  }

  /**
   * Incrementa el progreso de todas las misiones activas del usuario que matchean el tipo.
   *
   * El incremento es **atómico** (brecha C5): cada misión se actualiza vía `updateMany` condicionado
   * al valor de `current` que se leyó (`where: { current }`). Si dos eventos del mismo tipo llegan
   * concurrentemente, solo el primero cumple la condición y escribe; el segundo detecta el conflicto
   * (count === 0), relee el valor vigente y reintenta, de modo que ningún incremento se pierde.
   */
  private async incrementProgress(userId: string, missionType: string, amount: number): Promise<void> {
    const now = new Date();
    const missions = await this.prisma.mission.findMany({
      where: {
        userId,
        type: missionType,
        completed: false,
        periodEnd: { gt: now },
      },
    });

    if (missions.length === 0) return;

    for (const mission of missions) {
      const result = await this.atomicIncrement(userId, mission, amount);
      if (!result) continue;

      this.emitProgress(userId, mission.id, result.current, result.target);

      if (result.completed) {
        await this.emitMissionCompleted(userId, mission);
      }
    }
  }

  /**
   * Incrementa de forma atómica una sola misión con reintentos limitados. Devuelve el estado
   * resultante (para emitir) o `null` si no se pudo avanzar (misión inexistente/completada).
   */
  private async atomicIncrement(
    userId: string,
    mission: { id: string; current: number; target: number },
    amount: number,
  ): Promise<{ current: number; target: number; completed: boolean } | null> {
    let current = mission.current;
    for (let attempt = 0; attempt < 5; attempt++) {
      // Ya está completada (p. ej. por un evento concurrente): no se incrementa más.
      if (current >= mission.target) {
        return { current: mission.target, target: mission.target, completed: true };
      }

      const newCurrent = Math.min(mission.target, current + amount);
      const completed = newCurrent >= mission.target;

      // `updateMany` condicionado al `current` leído: si otro incremento lo modificó antes, la
      // condición no se cumple (count === 0) y se reintenta con el valor vigente.
      const updated = await this.prisma.mission.updateMany({
        where: { id: mission.id, userId, current, completed: false },
        data: { current: newCurrent, completed },
      });
      if (updated.count === 1) {
        return { current: newCurrent, target: mission.target, completed };
      }

      // Conflicto: releer el estado actual y reintentar.
      const fresh = await this.prisma.mission.findUnique({
        where: { id: mission.id },
        select: { current: true, target: true, completed: true },
      });
      if (!fresh) return null;
      if (fresh.completed) {
        return { current: fresh.current, target: fresh.target, completed: true };
      }
      current = fresh.current;
    }

    // Agotados los reintentos: devolver el último estado conocido para emitirlo (no se pierde el
    // progreso ya persistido por los incrementos concurrentes).
    const fresh = await this.prisma.mission.findUnique({
      where: { id: mission.id },
      select: { current: true, target: true, completed: true },
    });
    return fresh
      ? { current: fresh.current, target: fresh.target, completed: fresh.completed }
      : null;
  }

  private emitProgress(userId: string, missionId: string, current: number, target: number): void {
    const throttleKey = `${userId}:${missionId}`;
    const now = Date.now();
    const last = this.lastProgressEmit.get(throttleKey) ?? 0;

    if (now - last < this.PROGRESS_THROTTLE_MS) return;
    this.lastProgressEmit.set(throttleKey, now);

    this.realtimeGateway.emitToUser(userId, 'mission:progress', {
      missionId, current, target,
    });
  }

  private async emitMissionCompleted(
    userId: string,
    mission: {
      id: string;
      type: string;
      period: string;
      periodStart: Date;
      rewardCoins: number;
      rewardGems: number;
      rewardXp: number;
    },
  ): Promise<void> {
    const now = new Date();
    const [dailyCompleted, dailyTotal] = await Promise.all([
      this.prisma.mission.count({
        where: { userId, period: 'daily', completed: true, periodEnd: { gt: now } },
      }),
      this.prisma.mission.count({
        where: { userId, period: 'daily', periodEnd: { gt: now } },
      }),
    ]);

    this.realtimeGateway.emitToUser(userId, 'mission:completed', {
      missionId: mission.id,
      type: mission.type,
      reward: { coins: mission.rewardCoins, gems: mission.rewardGems, xp: mission.rewardXp },
      dailyCompleted,
      dailyTotal,
    });

    // Notificación con personalidad (feature 007): logro completado. Sin petId (misiones son por
    // usuario); el dispatcher resuelve el pet principal para el tono/personalidad.
    this.eventEmitter.emit('pet:mission-completed', { userId, missionId: mission.id, type: mission.type });

    // Al completar la última misión diaria se desbloquea el cofre diario (US4 / brecha C4).
    // Solo se dispara cuando la misión que acaba de completarse es diaria, para no re-otorgar el
    // cofre cuando cierra una misión semanal con las diarias ya completadas.
    if (dailyCompleted === dailyTotal && dailyTotal > 0 && mission.period === 'daily') {
      await this.grantDailyChest(userId, mission.periodStart);
      this.realtimeGateway.emitToUser(userId, 'mission:daily_complete', { chestUnlocked: true });
      this.logger.log(`Todas las misiones diarias completadas para usuario ${userId}: cofre diario desbloqueado`);
    }
  }

  /**
   * Otorga el cofre diario (`source: 'daily_mission'`) al completar todas las misiones del día.
   * Es idempotente por período: si ya existe un cofre diario sin abrir para el período en curso,
   * no se crea otro. `ChestsService.grantChest` es fire-and-forget (setImmediate) y crea el cofre
   * en BD emitiendo `chest:unlocked`.
   */
  private async grantDailyChest(userId: string, periodStart: Date): Promise<void> {
    try {
      const existing = await this.prisma.chest.count({
        where: { userId, source: 'daily_mission', openedAt: null, createdAt: { gte: periodStart } },
      });
      if (existing > 0) return;
      await this.chestsService.grantChest(userId, 'bronze', 'daily_mission');
    } catch (err: any) {
      // No bloquear el bucle de misiones si el otorgamiento del cofre falla.
      this.logger.error(`No se pudo otorgar el cofre diario para usuario ${userId}: ${err?.message}`);
    }
  }
}