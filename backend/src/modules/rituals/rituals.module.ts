import { Module } from '@nestjs/common';
import { RitualsController } from './rituals.controller';
import { RitualsService } from './rituals.service';
import { HabitDetectionService } from './habit-detection.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Módulo de dominio de Rituals (feature 030). `PrismaModule` y `RealtimeModule` son
 * globales; se importan para explicitar las dependencias del dominio.
 */
@Module({
  imports: [PrismaModule, PetsModule, RealtimeModule],
  controllers: [RitualsController],
  providers: [RitualsService, HabitDetectionService],
  exports: [RitualsService, HabitDetectionService],
})
export class RitualsModule {}
