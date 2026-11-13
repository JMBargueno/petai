import { Module } from '@nestjs/common';
import { BondingService } from './bonding.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GameDataModule } from '../game-data/game-data.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Módulo de dominio del Bonding Meter (feature 006). `PrismaModule` y `RealtimeModule` son
 * globales; se importan aquí para explicitar las dependencias del dominio (Constitución VI).
 */
@Module({
  imports: [PrismaModule, GameDataModule, RealtimeModule],
  providers: [BondingService],
  exports: [BondingService],
})
export class BondingModule {}
