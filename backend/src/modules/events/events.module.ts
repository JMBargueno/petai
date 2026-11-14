import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GameDataModule } from '../game-data/game-data.module';

/**
 * Módulo de eventos próximos (feature 009-edge-cdn, T024). `GET /events/upcoming` (Bearer JWT).
 * Fuente data-driven: `GameDataService` (`festivals.json` / Feature #5).
 */
@Module({
  imports: [GameDataModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}