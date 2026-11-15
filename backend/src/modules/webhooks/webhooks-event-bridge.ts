import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhooksService, WebhookEvent } from './webhooks.service';

/**
 * Puente eventos de dominio → webhooks (R-01).
 *
 * Los webhooks existían (register/list/remove/test, firma, SSRF, tracking) pero `dispatch`
 * **no estaba cableado a ningún evento**, así que nunca se entregaban. Aquí se escucha los
 * eventos reales que ya emiten los módulos (convención `pet:*`) y se dispara `dispatch` en
 * *background* (fire-and-forget): **no retiene la petición** que generó el evento (antes el
 * riesgo R-01 era que los reintentos bloquearan la respuesta) y un fallo de entrega no puede
 * romper el flujo de dominio.
 *
 * `season.ended` y `ai.reminder.created` (también en `KNOWN_EVENTS`) aún no se emiten por ningún
 * módulo; se cablean cuando esos flujos añadan su emisión.
 */
@Injectable()
export class WebhooksEventBridge {
  private readonly logger = new Logger(WebhooksEventBridge.name);

  constructor(private readonly webhooks: WebhooksService) {}

  /** Despacha en background: ni bloquea ni puede hacer fallar al dominio. */
  private fire(event: string, userId: string | undefined, petId?: string): void {
    if (!userId) return;
    const payload: WebhookEvent = petId ? { event, userId, petId } : { event, userId };
    this.webhooks.dispatch(payload).catch((err) => {
      this.logger.warn(`Fallo al despachar webhook ${event}: ${err?.message}`);
    });
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
