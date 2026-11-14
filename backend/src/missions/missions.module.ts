import { Module } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { MissionGenerationService } from './mission-generation.service';
import { MissionTrackingService } from './mission-tracking.service';
import { MissionSchedulerService } from './mission-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { GameDataModule } from '../modules/game-data/game-data.module';
import { RealtimeModule } from '../modules/realtime/realtime.module';
import { ChestsModule } from '../modules/chests/chests.module';

@Module({
  // ChestsModule se importa para poder otorgar el cofre diario al completar todas las misiones del
  // día (brecha C4 / US4). `ChestsModule` exporta `ChestsService` y no depende de `MissionsModule`,
  // por lo que no hay dependencia circular.
  imports: [PrismaModule, RedisModule, GameDataModule, RealtimeModule, ChestsModule],
  controllers: [MissionsController],
  providers: [MissionsService, MissionGenerationService, MissionTrackingService, MissionSchedulerService],
  exports: [MissionsService],
})
export class MissionsModule {}
