import { Module } from '@nestjs/common';
import { MinigamesService } from './minigames.service';
import { MinigamesController } from './minigames.controller';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';
import { BondingModule } from '../bonding/bonding.module';

@Module({
  imports: [PetsModule, GameDataModule, BondingModule],
  controllers: [MinigamesController],
  providers: [MinigamesService],
})
export class MinigamesModule {}
