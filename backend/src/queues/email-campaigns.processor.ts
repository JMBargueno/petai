import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AdminEmailService } from '../modules/admin-email/admin-email.service';
import { EMAIL_CAMPAIGNS_QUEUE } from './queue.constants';

/**
 * Processor de la cola `email-campaigns`: una tarea por envío del panel. Concurrencia 1 para no
 * saturar el SMTP; el ritmo por segundo y la reanudación por cursor viven en AdminEmailService.
 */
@Processor(EMAIL_CAMPAIGNS_QUEUE, { concurrency: 1 })
export class EmailCampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailCampaignsProcessor.name);

  constructor(private readonly emails: AdminEmailService) {
    super();
  }

  async process(job: Job<{ campaignId: string }>) {
    return this.emails.process(job.data.campaignId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ campaignId: string }> | undefined, err: Error) {
    if (!job) return;
    this.logger.error(`Envío ${job.data.campaignId} falló (intento ${job.attemptsMade}): ${err.message}`);
    // Sin más reintentos: queda marcado como fallido en el historial.
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.emails.markFailed(job.data.campaignId, err.message);
    }
  }
}
