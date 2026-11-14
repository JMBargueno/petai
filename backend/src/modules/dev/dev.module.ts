import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GameDataModule } from '../game-data/game-data.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DevController } from './dev.controller';
import { DevKitGuard } from './dev.guard';
import { DevHotReloadService } from './dev-hot-reload.service';
import { DevSeedService } from './dev-seed.service';
import { DevActionService } from './dev-action.service';
import { GameDataWatcherService } from './game-data-watcher.service';

/**
 * Módulo de herramientas de desarrollo (hot-reload, watcher, seed, action).
 *
 * Se registra de forma condicional en `AppModule` SOLO cuando `NODE_ENV !== 'production'`, de modo
 * que en producción las rutas `/dev/*` NO se registran (404) y ningún endpoint dev expone datos
 * sensibles (constitución I/VIII, SC-007).
 */
@Module({
  imports: [ConfigModule, GameDataModule, PrismaModule],
  controllers: [DevController],
  providers: [DevHotReloadService, DevSeedService, DevActionService, GameDataWatcherService, DevKitGuard],
})
export class DevModule {}