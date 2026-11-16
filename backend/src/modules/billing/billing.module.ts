import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BillingConfigService } from './billing-config.service';
import { DailyQuotaService } from './daily-quota.service';
import { EntitlementService } from './entitlement.service';
import { ManagedBudgetService } from './managed-budget.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeController } from './stripe.controller';
import { AdminBillingController } from './admin-billing.controller';
import { GooglePlayClient } from './google-play.client';

@Module({
  imports: [PrismaModule, RedisModule, RealtimeModule],
  controllers: [BillingController, StripeController, AdminBillingController],
  providers: [
    BillingConfigService,
    DailyQuotaService,
    EntitlementService,
    ManagedBudgetService,
    BillingService,
    GooglePlayClient,
  ],
  exports: [
    BillingConfigService,
    DailyQuotaService,
    EntitlementService,
    ManagedBudgetService,
    BillingService,
  ],
})
export class BillingModule {}
