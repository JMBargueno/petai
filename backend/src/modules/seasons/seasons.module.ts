import { Module } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { SeasonRewardsService } from './season-rewards.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PrismaModule, GameDataModule],
  controllers: [SeasonsController],
  providers: [SeasonsService, SeasonRewardsService],
  exports: [SeasonsService, SeasonRewardsService],
})
export class SeasonsModule {}
