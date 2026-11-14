import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { CoopCareService } from './coop-care.service';

/**
 * Multi-Device Presence + Co-op Module.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Provides device presence tracking and co-op visit system.
 */
@Module({
  controllers: [PresenceController],
  providers: [PresenceService, CoopCareService],
  exports: [PresenceService, CoopCareService],
})
export class PresenceModule {}
