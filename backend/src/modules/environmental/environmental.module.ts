import { Module } from '@nestjs/common';
import { EnvironmentalController } from './environmental.controller';
import { EnvironmentalService } from './environmental.service';
import { WeatherService } from './weather.service';
import { ActivityTrackerService } from './activity-tracker.service';
import { FestivalService } from './festival.service';
import { GameDataModule } from '../game-data/game-data.module';

/**
 * Módulo de dominio ambiental (feature 005): hora del día, clima real (Open-Meteo + cache Redis),
 * inactividad por heartbeat y festividades. Inyecta los recursos compartidos existentes
 * (Prisma, Redis, GameData, RealtimeGateway) y se registra en `AppModule` (Constitución VI).
 * `RealtimeModule` y `PrismaModule`/`RedisModule` son globales.
 */
@Module({
  imports: [GameDataModule],
  controllers: [EnvironmentalController],
  providers: [EnvironmentalService, WeatherService, ActivityTrackerService, FestivalService],
  exports: [EnvironmentalService, WeatherService],
})
export class EnvironmentalModule {}
