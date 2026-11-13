import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [InventoryModule, GameDataModule],
  controllers: [PetsController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}
