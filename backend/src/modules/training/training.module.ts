import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';
import { BondingModule } from '../bonding/bonding.module';

@Module({
  imports: [PetsModule, GameDataModule, BondingModule],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}