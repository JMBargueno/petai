import { Module } from '@nestjs/common';
import { EnvironmentalController } from './environmental.controller';
import { EnvironmentalService } from './environmental.service';
import { ActivityTrackerService } from './activity-tracker.service';
import { FestivalService } from './festival.service';
import { GameDataModule } from '../game-data/game-data.module';

/**
 * Módulo de dominio ambiental (feature 005): hora del día, inactividad por heartbeat y festividades
 * (el clima lo lee cada app en su propio dispositivo; el servidor no conoce la ubicación).
 * Inyecta los recursos compartidos existentes
 * (Prisma, Redis, GameData, RealtimeGateway) y se registra en `AppModule` (Constitución VI).
 * `RealtimeModule` y `PrismaModule`/`RedisModule` son globales.
 */
@Module({
  imports: [GameDataModule],
  controllers: [EnvironmentalController],
  providers: [EnvironmentalService, ActivityTrackerService, FestivalService],
  exports: [EnvironmentalService],
})
export class EnvironmentalModule {}
