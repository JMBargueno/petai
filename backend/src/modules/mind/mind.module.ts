import { Module } from '@nestjs/common';
import { GameDataModule } from '../game-data/game-data.module';
import { BillingModule } from '../billing/billing.module';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';
import { AutonomyService } from './autonomy.service';
import { EvolutionListener } from './evolution.listener';
import { MindController } from './mind.controller';

/**
 * Cerebro de los Pockai (spec 36): Personality, Memory, Behavior, Evolution y vida autónoma.
 * No depende de PetsModule ni AiModule (son ellos los que lo usan), así no hay ciclos.
 */
@Module({
  imports: [GameDataModule, BillingModule],
  controllers: [MindController],
  providers: [MindService, MindMemoryService, AutonomyService, EvolutionListener],
  exports: [MindService, MindMemoryService, AutonomyService],
})
export class MindModule {}
