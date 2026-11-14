import { Module } from '@nestjs/common';
import { GenesController } from './genes.controller';
import { GenesService } from './genes.service';
import { GeneRevealService } from './gene-reveal.service';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PetsModule, GameDataModule],
  controllers: [GenesController],
  providers: [GenesService, GeneRevealService],
  exports: [GenesService, GeneRevealService],
})
export class GenesModule {}