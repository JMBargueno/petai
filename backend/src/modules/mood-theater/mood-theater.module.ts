import { Module } from '@nestjs/common';
import { MoodTheaterController } from './mood-theater.controller';
import { MoodTheaterService } from './mood-theater.service';
import { MomentCaptureService } from './moment-capture.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Módulo de dominio de Mood Theater (feature 031). `PrismaModule` y `RealtimeModule`
 * son globales; se importan para explicitar las dependencias del dominio.
 */
@Module({
  imports: [PrismaModule, PetsModule, RealtimeModule],
  controllers: [MoodTheaterController],
  providers: [MoodTheaterService, MomentCaptureService],
  exports: [MoodTheaterService, MomentCaptureService],
})
export class MoodTheaterModule {}
