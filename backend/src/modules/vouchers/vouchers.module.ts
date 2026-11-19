import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { GameDataModule } from '../game-data/game-data.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AdminVouchersController } from './admin-vouchers.controller';
import { RewardsService } from './rewards.service';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';

/** Vouchers de recompensas (panel admin + canje) y regalos directos a usuarios. */
@Module({
  imports: [AuthModule, BillingModule, GameDataModule, InventoryModule],
  controllers: [AdminVouchersController, VouchersController],
  providers: [RewardsService, VouchersService],
  exports: [RewardsService],
})
export class VouchersModule {}
