import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { GameDataModule } from '../game-data/game-data.module';
import { EnvironmentalModule } from '../environmental/environmental.module';
import { BondingModule } from '../bonding/bonding.module';

@Module({
  imports: [InventoryModule, GameDataModule, EnvironmentalModule, BondingModule],
  controllers: [PetsController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}
