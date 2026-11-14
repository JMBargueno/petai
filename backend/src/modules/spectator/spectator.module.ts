import { Module } from '@nestjs/common';
import { SpectatorController } from './spectator.controller';
import { SpectatorService } from './spectator.service';
import { HighlightService } from './highlight.service';

/**
 * Combat Spectator Module.
 * Feature 023: Combat Spectator
 *
 * Provides live combat spectating with 10s delay,
 * automatic highlight detection, and weekly feed.
 */
@Module({
  controllers: [SpectatorController],
  providers: [SpectatorService, HighlightService],
  exports: [SpectatorService, HighlightService],
})
export class SpectatorModule {}
