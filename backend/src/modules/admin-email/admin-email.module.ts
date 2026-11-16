import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { EMAIL_CAMPAIGNS_QUEUE } from '../../queues/queue.constants';
import { EmailCampaignsProcessor } from '../../queues/email-campaigns.processor';
import { AdminEmailController, EmailUnsubscribeController } from './admin-email.controller';
import { AdminEmailService } from './admin-email.service';

/**
 * Envíos de correo desde el panel de administración + bajas.
 * La conexión de BullMQ (`BullModule.forRootAsync`, global) se registra en WebhooksModule.
 */
@Module({
  imports: [AuthModule, AuthzModule, BullModule.registerQueue({ name: EMAIL_CAMPAIGNS_QUEUE })],
  controllers: [AdminEmailController, EmailUnsubscribeController],
  providers: [AdminEmailService, EmailCampaignsProcessor],
})
export class AdminEmailModule {}
