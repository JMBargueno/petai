import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { DeltaSyncService } from './delta-sync.service';
import { CrdtService } from './crdt.service';

/**
 * Offline-First CRDT Sync Module.
 * Feature 022: Offline-First CRDT Sync
 *
 * Provides delta sync with conflict resolution (LWW, merge, deterministic).
 */
@Module({
  controllers: [SyncController],
  providers: [DeltaSyncService, CrdtService],
  exports: [DeltaSyncService, CrdtService],
})
export class SyncModule {}
