import { Module } from '@nestjs/common';
import { AdventureController } from './adventure.controller';
import { AdventureService } from './adventure.service';
import { AdventureOrchestratorService } from './adventure-orchestrator.service';
import { PetsModule } from '../pets/pets.module';
import { AiModule } from '../ai/ai.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [PetsModule, AiModule, GameDataModule],
  controllers: [AdventureController],
  providers: [AdventureService, AdventureOrchestratorService],
  exports: [AdventureService],
})
export class AdventureModule {}