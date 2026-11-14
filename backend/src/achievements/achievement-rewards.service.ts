import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';
import { InventoryService } from '../modules/inventory/inventory.service';

/** Payload del evento WebSocket `achievement:unlocked`. */
export interface AchievementUnlockedPayload {
  id: string;
  name: string;
  category: string;
  tier: string;
  reward: { coins: number; gems: number; xp: number; itemId: string | null };
}

/**
 * Acreditación atómica de recompensas de logros (feature 008 / US3).
 *
 * El desbloqueo usa `updateMany` con la condición `unlockedAt: null` (y `current >= target`) dentro
 * de una transacción: dos eventos concurrentes que intentan desbloquear el mismo logro producen
 * `count === 1` solo en el primero, garantizando que la recompensa (monedas/gemas/xp/item) NO se
 * duplique (SC-003, constitución I). El item exclusivo se otorga idempotentemente vía
 * `InventoryService.grantExclusiveItem` (SC-004).
 */
@Injectable()
export class AchievementRewardsService {
  private readonly logger = new Logger(AchievementRewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Desbloquea `achId` de forma atómica y acredita su recompensa. Devuelve el payload si el logro se
   * acaba de desbloquear (para emitir `achievement:unlocked`), o `null` si ya estaba desbloqueado
   * (idempotente: no re-emite ni re-acredita).
   */
  async unlockAndGrant(userId: string, achId: string): Promise<AchievementUnlockedPayload | null> {
    const data = this.gameData.getAchievements();
    const def = data?.achievements?.find((a: any) => a.id === achId);
    if (!def) {
      this.logger.debug(`Desbloqueo ignorado: logro desconocido ${achId}`);
      return null;
    }

    const { target, name, category, tier, reward } = def;

    const result = await this.prisma.$transaction(async (tx) => {
      // Condición atómica: solo desbloquea si aún no lo está y ya alcanzó el objetivo.
      const unlocked = await tx.achievement.updateMany({
        where: { userId, achId, unlockedAt: null, current: { gte: target } },
        data: { unlockedAt: new Date() },
      });
      if (unlocked.count === 0) return null;

      // Acrecenta el saldo del usuario exactamente una vez.
      await tx.user.update({
        where: { id: userId },
        data: {
          coins: { increment: reward.coins },
          gems: { increment: reward.gems },
          accountXp: { increment: reward.xp },
        },
      });

      // Item exclusivo (cosmético): idempotente, otorgado una sola vez.
      if (reward.itemId) {
        await this.inventoryService.grantExclusiveItem(userId, reward.itemId, tx);
      }

      return {
        id: achId,
        name,
        category,
        tier,
        reward,
      } as AchievementUnlockedPayload;
    });

    if (result) {
      this.logger.log(`Logro ${achId} desbloqueado para usuario ${userId}: recompensa acreditada`);
    }
    return result;
  }

  /** Emite `achievement:unlocked` por WebSocket al usuario. */
  emitUnlocked(userId: string, payload: AchievementUnlockedPayload): void {
    this.realtimeGateway.emitToUser(userId, 'achievement:unlocked', payload);
  }
}
