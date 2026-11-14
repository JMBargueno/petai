import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PublicApiController } from './public-api.controller';
import { WebhooksService } from './webhooks.service';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthModule } from '../auth/auth.module';
import { BattlesModule } from '../battles/battles.module';
import { GameDataModule } from '../game-data/game-data.module';

@Module({
  imports: [AuthModule, BattlesModule, GameDataModule],
  controllers: [WebhooksController, PublicApiController],
  providers: [WebhooksService, ApiKeyService, ApiKeyGuard],
  exports: [WebhooksService, ApiKeyService],
})
export class WebhooksModule {}
