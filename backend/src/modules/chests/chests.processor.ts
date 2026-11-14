import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Payload del job `chests:create`. */
export interface CreateChestJob {
  userId: string;
  type: string;
  source: string;
}

/**
 * Procesador de jobs de cofres.
 *
 * ─── ADR: Ejecución de jobs de cofres — in-process vs BullMQ (FR-013 / T011) ────────────────
 *
 * **Contexto**
 *   El spec prescribe (FR-013) crear/limpiar cofres "asíncronamente vía el job BullMQ
 *   `chests:create`". Sin embargo, el backend de PetAI no monta un bus de jobs externo: Redis
 *   (ver `RedisModule`) está reservado para caché/sesiones y el proyecto no tiene workers BullMQ.
 *
 * **Decisión**
 *   Ejecutar los jobs **en proceso**, dentro del propio backend, sin infraestructura externa:
 *     - `chests:create`  → `processCreate()` (método público) invocado vía `setImmediate` desde
 *                          `ChestsService.grantChest` (fire-and-forget, no bloquea al llamante).
 *     - `chests:cleanup` → `cleanupExpiredChests()` con `@nestjs/schedule` (`@Cron` diario 03:00).
 *
 * **Racional (YAGNI)**
 *   1. El objetivo funcional de FR-013 — *no bloquear la acción disparadora* — se cumple: el
 *      llamante no espera el `create`; la creación ocurre fuera del tick de la petición.
 *   2. A la escala del MVP (un cofre por evento, un solo deploy) un bus externo añade
 *      complejidad real — colas, reintentos, observabilidad, despliegue de workers — sin beneficio
 *      medible hoy. La constitución exige no sobrediseñar la infraestructura.
 *   3. En proceso el código es más simple, determinista y testable; no introduce una dependencia
 *      ni un componente de despliegue adicional.
 *
 * **Consecuencias / trade-offs asumidos**
 *   - **Sin durabilidad**: si el proceso cae entre `setImmediate` y `create`, se perdería ese
 *     cofre concreto. Aceptado porque el otorgamiento es reintentable (otra misión/victoria lo
 *     re-otorga) y no es crítico para el balance a esta escala.
 *   - **Sin fan-out** a múltiples workers; irrelevante para la escala actual de un solo nodo.
 *
 * **Reversión**
 *   Si en el futuro se requiere durabilidad o escala multi-nodo, migrar a un worker BullMQ real
 *   `chests:create`/`chests:cleanup` reutilizando `RedisModule`; las firmas de `processCreate` y
 *   `cleanupExpiredChests` ya están alineadas para esa transición sin tocar `ChestsService`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `processCreate` crea el `Chest` en BD y emite `chest:unlocked` (FR-012); `cleanupExpiredChests`
 * convierte a monedas los cofres no abiertos de más de 30 días y los elimina (FR-014).
 */
@Injectable()
export class ChestsProcessor {
  private readonly logger = new Logger(ChestsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async processCreate(payload: CreateChestJob): Promise<void> {
    const { userId, type, source } = payload;
    const chest = await this.prisma.chest.create({ data: { userId, type, source } });
    this.realtime.emitToUser(userId, 'chest:unlocked', { chestId: chest.id, type, source });
    this.logger.debug(`Cofre creado: userId=${userId} type=${type} source=${source}`);
  }

  /**
   * Job diario `chests:cleanup` (03:00 UTC). Expone un método `cleanupExpiredChests()` público para
   * poder dispararlo manualmente en dev (T030).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredChests(): Promise<void> {
    try {
      const expiryDays = this.expiryDays();
      const cutoff = new Date(Date.now() - expiryDays * 24 * 60 * 60 * 1000);
      const expired = await this.prisma.chest.findMany({
        where: { openedAt: null, createdAt: { lt: cutoff } },
        select: { id: true, userId: true, type: true },
        take: 500,
      });
      if (expired.length === 0) return;

      for (const chest of expired) {
        const refund = this.refundCoins(chest.type);
        // Conversión a monedas + borrado en una transacción (no se cobra dos veces).
        await this.prisma.$transaction(async (tx) => {
          await tx.user.updateMany({
            where: { id: chest.userId },
            data: { coins: { increment: refund } },
          });
          await tx.chest.delete({ where: { id: chest.id } });
        });
      }
      this.logger.log(`Cofres caducados: ${expired.length} convertidos a monedas`);
    } catch (err: any) {
      this.logger.error(`Error en limpieza de cofres: ${err?.message}`);
    }
  }

  private expiryDays(): number {
    const c = (this.gameData.getBalance() ?? {})?.chests;
    return typeof c?.expiryDays === 'number' ? c.expiryDays : 30;
  }

  /** Reembolso en monedas al caducar: media de su precio en monedas (default razonable, data-driven). */
  private refundCoins(type: string): number {
    const c = (this.gameData.getBalance() ?? {})?.chests;
    const coins = c?.[type]?.prices?.coins;
    return typeof coins === 'number' ? Math.max(0, Math.floor(coins / 2)) : 0;
  }
}