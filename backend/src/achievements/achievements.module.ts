import { Module } from '@nestjs/common';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';
import { AchievementTrackingService } from './achievement-tracking.service';
import { AchievementRewardsService } from './achievement-rewards.service';
import { ConstellationService } from './constellation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { GameDataModule } from '../modules/game-data/game-data.module';
import { RealtimeModule } from '../modules/realtime/realtime.module';
import { InventoryModule } from '../modules/inventory/inventory.module';

/**
 * Módulo de logros y constelación visual (feature 008).
 *
 * - `AchievementsService`: lectura del panel, claim y perfil público.
 * - `AchievementTrackingService`: eventos de dominio → progreso/desbloqueo (US2).
 * - `AchievementRewardsService`: desbloqueo atómico + acreditación de recompensa + WS (US3).
 * - `ConstellationService`: layout SVG por categoría (US4).
 *
 * `InventoryModule` se importa para otorgar items exclusivos idempotentemente; no depende de este
 * módulo, así que no hay dependencia circular. `EventEmitterModule`/`ScheduleModule` ya son
 * globales en `AppModule`.
 */
@Module({
  imports: [PrismaModule, RedisModule, GameDataModule, RealtimeModule, InventoryModule],
  controllers: [AchievementsController],
  providers: [AchievementsService, AchievementTrackingService, AchievementRewardsService, ConstellationService],
  exports: [AchievementsService, ConstellationService],
})
export class AchievementsModule {}
