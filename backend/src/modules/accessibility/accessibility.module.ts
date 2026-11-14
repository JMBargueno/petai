import { Module } from '@nestjs/common';
import { AccessibilityController } from './accessibility.controller';
import { AccessibilityService } from './accessibility.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Módulo de dominio de Accessibility (feature 032). Persiste prefs y expone config
 * centralizada; `PrismaModule` es global.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AccessibilityController],
  providers: [AccessibilityService],
  exports: [AccessibilityService],
})
export class AccessibilityModule {}
