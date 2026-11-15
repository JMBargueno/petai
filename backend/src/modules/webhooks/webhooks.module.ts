import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { PublicApiController } from './public-api.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksEventBridge } from './webhooks-event-bridge';
import { WebhooksProcessor } from '../../queues/webhooks.processor';
import { WEBHOOKS_QUEUE } from '../../queues/queue.constants';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthModule } from '../auth/auth.module';
import { BattlesModule } from '../battles/battles.module';
import { GameDataModule } from '../game-data/game-data.module';

/** Parsea `REDIS_URL` (`redis://[user:pass@]host:port[/db]`) para la conexión de BullMQ. */
function parseRedisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || 'localhost',
    port: u.port ? parseInt(u.port, 10) : 6379,
    password: u.password || undefined,
    username: u.username || undefined,
    db: u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
  };
}

@Module({
  imports: [
    AuthModule,
    BattlesModule,
    GameDataModule,
    // R-01: conexión BullMQ sobre el Redis existente + cola `webhooks` (entrega durable/distribuida).
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisConnection(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
      }),
    }),
    BullModule.registerQueue({ name: WEBHOOKS_QUEUE }),
  ],
  controllers: [WebhooksController, PublicApiController],
  providers: [WebhooksService, WebhooksEventBridge, WebhooksProcessor, ApiKeyService, ApiKeyGuard],
  exports: [WebhooksService, ApiKeyService],
})
export class WebhooksModule {}

