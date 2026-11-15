import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import type { WebhookEvent } from './webhooks.service';
import { WEBHOOKS_QUEUE } from '../../queues/queue.constants';

/**
 * Puente eventos de dominio → webhooks (R-01).
 *
 * Los módulos emiten eventos (`pet:*`); aquí se mapean al nombre de webhook y se **encolan** en
 * BullMQ (`webhooks`) en lugar de despacharse inline: la entrega es **durable** (sobrevive a un
 * reinicio de réplica), **distribuida** (cualquier réplica la procesa) y con **reintento a nivel
 * de cola**. La réplica que genera el evento no lo retiene, y un fallo de encolado no puede romper
 * el flujo de dominio (el `add` es fire-and-forget).
 *
 * `season.ended` y `ai.reminder.created` (también en `KNOWN_EVENTS`) aún no se emiten por ningún
 * módulo; se cablean cuando esos flujos añadan su emisión.
 */
@Injectable()
export class WebhooksEventBridge {
  private readonly logger = new Logger(WebhooksEventBridge.name);

  constructor(@InjectQueue(WEBHOOKS_QUEUE) private readonly webhooksQueue: Queue) {}

  /** Encola la entrega: ni bloquea al dominio ni un fallo de encolado lo rompe. */
  private fire(event: string, userId: string | undefined, petId?: string): void {
    if (!userId) return;
    const payload: WebhookEvent = petId ? { event, userId, petId } : { event, userId };
    this.webhooksQueue
      .add('webhook', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: false,
      })
      .catch((err) => this.logger.warn(`No se pudo encolar el webhook '${event}': ${err?.message}`));
  }

  @OnEvent('pet:evolved')
  onPetEvolved(payload: { userId: string; petId: string }): void {
    this.fire('pet.evolved', payload?.userId, payload?.petId);
  }

  @OnEvent('pet:battle-won')
  onBattleWon(payload: { userId: string; petId: string; won: boolean }): void {
    this.fire('combat.finished', payload?.userId, payload?.petId);
  }

  @OnEvent('pet:battle-lost')
  onBattleLost(payload: { userId: string; petId: string; won: boolean }): void {
    this.fire('combat.finished', payload?.userId, payload?.petId);
  }

  @OnEvent('pet:level_up')
  onLevelUp(payload: { userId: string; petId: string }): void {
    this.fire('level.up', payload?.userId, payload?.petId);
  }
}

