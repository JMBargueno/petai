import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { ActivityDropsService } from './activity-drops.service';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [GameDataModule],
  controllers: [InventoryController],
  providers: [InventoryService, ActivityDropsService],
  exports: [InventoryService, ActivityDropsService],
})
export class InventoryModule {}
