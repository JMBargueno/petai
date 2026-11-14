import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { GameDataModule } from '../game-data/game-data.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChestsController } from './chests.controller';
import { ChestsService } from './chests.service';
import { DropEngineService } from './drop-engine.service';
import { ChestPityService } from './chest-pity.service';
import { ChestsProcessor } from './chests.processor';

/**
 * Módulo de Cofres y Drops. `DropEngineService` es un motor puro (sin DI de Nest) que se provee de
 * forma directa; el resto de los proveedores son servicios del módulo. `ChestsService` se exporta
 * para que otros módulos (missions, battles, pets/evolve, events) puedan otorgar cofres.
 */
@Module({
  imports: [PrismaModule, RedisModule, GameDataModule, RealtimeModule],
  controllers: [ChestsController],
  providers: [ChestsService, DropEngineService, ChestPityService, ChestsProcessor],
  exports: [ChestsService],
})
export class ChestsModule {}