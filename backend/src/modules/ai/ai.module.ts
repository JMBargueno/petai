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
import { EnvironmentalModule } from '../environmental/environmental.module';
import { BondingModule } from '../bonding/bonding.module';

@Module({
  imports: [PetsModule, GameDataModule, EnvironmentalModule, BondingModule],
  controllers: [AiController],
  providers: [AiConfigService, ChatService, KeyCryptoService, MemoryService, AgentService, UsageService],
})
export class AiModule {}
