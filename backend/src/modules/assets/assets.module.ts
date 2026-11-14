import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/**
 * Módulo origin de assets (feature 009-edge-cdn, T004). MIRROR/fallback del CDN:
 * `GET /assets/manifest` y `GET /assets/:key`. No requiere Prisma ni auth.
 */
@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}