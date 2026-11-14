import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppExceptionFilter } from './common/app-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { GameDataModule } from './modules/game-data/game-data.module';
import { AssetsModule } from './modules/assets/assets.module';
import { EventsModule } from './modules/events/events.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HatchingModule } from './modules/hatching/hatching.module';
import { PetsModule } from './modules/pets/pets.module';
import { BondingModule } from './modules/bonding/bonding.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MinigamesModule } from './modules/minigames/minigames.module';
import { AiModule } from './modules/ai/ai.module';
import { BattlesModule } from './modules/battles/battles.module';
import { HealthModule } from './modules/health/health.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ObservabilityModule } from './observability/observability.module';
import { MissionsModule } from './missions/missions.module';
import { AchievementsModule } from './achievements/achievements.module';
import { ChestsModule } from './modules/chests/chests.module';
import { EnvironmentalModule } from './modules/environmental/environmental.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HabitatModule } from './modules/habitat/habitat.module';
import { SeasonsModule } from './modules/seasons/seasons.module';
import { BreedingModule } from './modules/breeding/breeding.module';
import { TrainingModule } from './modules/training/training.module';
import { GenesModule } from './modules/genes/genes.module';
import { AdventureModule } from './modules/adventure/adventure.module';
import { DevModule } from './modules/dev/dev.module';
import { RaidModule } from './modules/raid/raid.module';
import { TournamentModule } from './modules/tournament/tournament.module';
import { CookingModule } from './modules/cooking/cooking.module';

// DevKit: las rutas `/dev/*` (hot-reload, seed, action) solo existen fuera de producción.
// En `NODE_ENV === 'production'` el DevModule no se registra ⇒ 404 (SC-007, constitución I/VIII).
const DEV_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'backend/.env'],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ObservabilityModule.forRoot(),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    GameDataModule,
    AssetsModule,
    EventsModule,
    AuthModule,
    UsersModule,
    HatchingModule,
    PetsModule,
    BondingModule,
    InventoryModule,
    MinigamesModule,
    AiModule,
    BattlesModule,
    HealthModule,
    MissionsModule,
    AchievementsModule,
    ChestsModule,
    EnvironmentalModule,
    NotificationsModule,
    HabitatModule,
    SeasonsModule,
    BreedingModule,
    RaidModule,
    TournamentModule,
    CookingModule,
    TrainingModule,
    GenesModule,
    AdventureModule,
    ...(DEV_TOOLS_ENABLED ? [DevModule] : []),
  ],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
