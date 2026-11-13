import { Module } from '@nestjs/common';
import { HatchingService } from './hatching.service';
import { HatchingController } from './hatching.controller';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [GameDataModule],
  controllers: [HatchingController],
  providers: [HatchingService],
  exports: [HatchingService],
})
export class HatchingModule {}
