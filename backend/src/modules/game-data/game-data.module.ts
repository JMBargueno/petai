import { Module } from '@nestjs/common';
import { GameDataService } from './game-data.service';
import { GameDataController } from './game-data.controller';

@Module({
  controllers: [GameDataController],
  providers: [GameDataService],
  exports: [GameDataService],
})
export class GameDataModule {}
