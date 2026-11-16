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
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PetsModule, GameDataModule, EnvironmentalModule, BondingModule, BillingModule],
  controllers: [AiController],
  providers: [AiConfigService, ChatService, KeyCryptoService, MemoryService, AgentService, UsageService],
  // `AiConfigService` se exporta para el módulo de notificaciones (feature 007), que reutiliza el
  // mecanismo de LLM call (resolveProvider) sin registrar consumo en `AiUsage`.
  exports: [AiConfigService],
})
export class AiModule {}
