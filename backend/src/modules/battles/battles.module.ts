import { Module } from '@nestjs/common';
import { BattlesController } from './battles.controller';
import { BattlesService } from './battles.service';
import { LeaderboardService } from './leaderboard.service';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';
import { BondingModule } from '../bonding/bonding.module';

@Module({
  imports: [PetsModule, GameDataModule, BondingModule],
  controllers: [BattlesController],
  providers: [BattlesService, LeaderboardService],
  exports: [BattlesService],
})
export class BattlesModule {}
