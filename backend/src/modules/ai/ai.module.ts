import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiConfigService } from './ai-config.service';
import { ChatService } from './chat.service';
import { KeyCryptoService } from './key-crypto.service';
import { MemoryService } from './memory.service';
import { AgentService } from './agent.service';
import { UsageService } from './usage.service';
import { GameDataModule } from '../game-data/game-data.module';
import { PetsModule } from '../pets/pets.module';

@Module({
  imports: [PetsModule, GameDataModule],
  controllers: [AiController],
  providers: [AiConfigService, ChatService, KeyCryptoService, MemoryService, AgentService, UsageService],
})
export class AiModule {}
