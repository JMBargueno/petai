import { Module } from '@nestjs/common';
import { TournamentController } from './tournament.controller';
import { TournamentService } from './tournament.service';
import { BracketService } from './bracket.service';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PetsModule, GameDataModule],
  controllers: [TournamentController],
  providers: [TournamentService, BracketService],
})
export class TournamentModule {}