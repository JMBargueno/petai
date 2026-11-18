import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GameDataModule } from '../game-data/game-data.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AccessoriesController } from './accessories.controller';
import { AccessoriesService } from './accessories.service';

@Module({
  imports: [PrismaModule, GameDataModule, InventoryModule],
  controllers: [AccessoriesController],
  providers: [AccessoriesService],
  exports: [AccessoriesService],
})
export class AccessoriesModule {}
