import { Module } from '@nestjs/common';
import { BuddiesController } from './buddies.controller';
import { BuddiesService } from './buddies.service';
import { InteractionEngineService } from './interaction-engine.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PetsModule } from '../pets/pets.module';
import { BondingModule } from '../bonding/bonding.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Módulo de dominio de Pet Buddies (feature 029). `PrismaModule` y `RealtimeModule`
 * son globales; se importan para explicitar las dependencias del dominio.
 */
@Module({
  imports: [PrismaModule, PetsModule, BondingModule, RealtimeModule],
  controllers: [BuddiesController],
  providers: [BuddiesService, InteractionEngineService],
  exports: [BuddiesService, InteractionEngineService],
})
export class BuddiesModule {}
