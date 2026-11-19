import { InventoryModule } from '../inventory/inventory.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { GameDataModule } from '../game-data/game-data.module';
import { PetsModule } from '../pets/pets.module';
import { AdminDecisionStoryController } from './admin-decision-story.controller';
import { DecisionStoryController } from './decision-story.controller';
import { DecisionStoryGenerator } from './decision-story.generator';
import { DecisionStoryService } from './decision-story.service';
import { LegacyAdventureController } from './legacy-adventure.controller';

/**
 * Aventura diaria: bucket de historias de decisión que teje cada noche la IA del sistema
 * (DecisionStoryGenerator) y las partidas de los usuarios sobre ellas.
 */
@Module({
  imports: [InventoryModule, PrismaModule, RedisModule, AiModule, BillingModule, GameDataModule, PetsModule],
  controllers: [DecisionStoryController, AdminDecisionStoryController, LegacyAdventureController],
  providers: [DecisionStoryGenerator, DecisionStoryService],
  exports: [DecisionStoryGenerator, DecisionStoryService],
})
export class DecisionStoryModule {}
