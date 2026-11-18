import { MindModule } from '../mind/mind.module';
import { Module } from '@nestjs/common';
import { HatchingService } from './hatching.service';
import { HatchingController } from './hatching.controller';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [GameDataModule, MindModule],
  controllers: [HatchingController],
  providers: [HatchingService],
  exports: [HatchingService],
})
export class HatchingModule {}
