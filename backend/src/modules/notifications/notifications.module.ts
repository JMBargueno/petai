import { Module } from '@nestjs/common';
import { GameDataModule } from '../game-data/game-data.module';
import { AiModule } from '../ai/ai.module';
import { NotificationGeneratorService } from './notification-generator.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

/**
 * Módulo de notificaciones con personalidad (feature 007).
 *
 * `PrismaModule`, `RedisModule` y `RealtimeModule` son globales y no se importan aquí. Se importan
 * `GameDataModule` (plantillas + config), `AiModule` (exporta `AiConfigService` para el LLM call)
 * y se registran los dos servicios del dominio.
 */
@Module({
  imports: [GameDataModule, AiModule],
  providers: [NotificationGeneratorService, NotificationDispatcherService],
  exports: [NotificationGeneratorService, NotificationDispatcherService],
})
export class NotificationsModule {}
