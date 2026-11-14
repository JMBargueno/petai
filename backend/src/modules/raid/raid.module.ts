import { Module } from '@nestjs/common';
import { RaidController } from './raid.controller';
import { RaidService } from './raid.service';
import { PetsModule } from '../pets/pets.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PetsModule, GameDataModule],
  controllers: [RaidController],
  providers: [RaidService],
})
export class RaidModule {}