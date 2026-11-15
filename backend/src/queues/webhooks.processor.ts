import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WebhooksService, WebhookEvent } from '../modules/webhooks/webhooks.service';
import { WEBHOOKS_QUEUE } from './queue.constants';

/**
 * R-01 — Processor de la cola `webhooks`.
 *
 * La entrega de webhooks ya no corre inline en la réplica que emitió el evento: se encola y lo
 * procesa cualquier réplica (reparto) y sobrevive a un reinicio (durabilidad). La lógica de
 * entrega —reintento con backoff, firma HMAC, política SSRF y tracking en BD— vive en
 * `WebhooksService.dispatch`; aquí solo se delega. El reintento a nivel de cola es una red de
 * seguridad para que `dispatch` falle *como función* (p. ej. la BD no responde): los fallos de
 * *entrega* a un endpoint ya se reintentan y registran dentro de `dispatch`.
 */
@Processor(WEBHOOKS_QUEUE)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(private readonly webhooks: WebhooksService) {
    super();
  }

  async process(job: Job<WebhookEvent>): Promise<number> {
    const payload = job.data;
    if (!payload?.userId) return 0;
    const delivered = await this.webhooks.dispatch(payload);
    this.logger.debug(`webhook '${payload.event}' (userId=${payload.userId}) → ${delivered} entregas`);
    return delivered;
  }
}
