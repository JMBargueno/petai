import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { CoopFriendsController } from './coop-friends.controller';
import { PresenceService } from './presence.service';
import { CoopCareService } from './coop-care.service';
import { HabitatVisitController } from './habitat-visit.controller';
import { HabitatVisitService } from './habitat-visit.service';
import { VisitDialogService } from './visit-dialog.service';

/**
 * Multi-Device Presence + Co-op Module.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Provides device presence tracking, friendship management, the co-op visit system and the
 * live habitat-visit system (el pet del visitante aparece en el habitat del dueño en tiempo real).
 */
@Module({
  controllers: [PresenceController, CoopFriendsController, HabitatVisitController],
  providers: [PresenceService, CoopCareService, HabitatVisitService, VisitDialogService],
  exports: [PresenceService, CoopCareService, HabitatVisitService],
})
export class PresenceModule {}
