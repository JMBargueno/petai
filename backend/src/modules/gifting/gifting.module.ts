import { Module } from '@nestjs/common';
import { GiftingController } from './gifting.controller';
import { GiftingService } from './gifting.service';
import { CarePackageService } from './care-package.service';
import { GroupFeedingService } from './group-feeding.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Módulo de dominio de Gifting & Care Packages (feature 033). Tres servicios
 * especializados (gifting, care-package, group-feeding); `PrismaModule` y
 * `RealtimeModule` son globales.
 */
@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [GiftingController],
  providers: [GiftingService, CarePackageService, GroupFeedingService],
  exports: [GiftingService, CarePackageService, GroupFeedingService],
})
export class GiftingModule {}
