import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrdtService } from './crdt.service';

/**
 * Delta Sync Service — orchestrates push/pull synchronization.
 * Feature 022: Offline-First CRDT Sync
 */

export interface SyncAction {
  id: string;
  petId: string;
  type: 'feed' | 'play' | 'clean' | 'sleep' | 'wake' | 'chat' | 'battle' | 'evolve';
  args: Record<string, unknown>;
  timestamp: number;
}

export interface PushResponse {
  newVersion: number;
  applied: string[];
  rejected: Array<{ actionId: string; reason: string }>;
  state: Record<string, unknown>;
}

export interface PullResponse {
  version: number;
  deltas: Array<{ petId: string; changes: Record<string, unknown>; timestamp: number }>;
}

const MAX_ACTIONS_PER_PUSH = 500;
const BATCH_SIZE = 50;

const userVersions = new Map<string, number>();
const userState = new Map<string, Record<string, unknown>>();
const appliedActions = new Set<string>();
const userDeltas = new Map<string, Array<{ petId: string; changes: Record<string, unknown>; timestamp: number }>>();

@Injectable()
export class DeltaSyncService {
  private readonly logger = new Logger(DeltaSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly crdtService: CrdtService,
  ) {}

  async push(userId: string, actions: SyncAction[]): Promise<PushResponse> {
    if (actions.length > MAX_ACTIONS_PER_PUSH) {
      throw new HttpException(`Too many actions (max ${MAX_ACTIONS_PER_PUSH})`, HttpStatus.BAD_REQUEST);
    }

    const newActions = actions.filter((a) => !appliedActions.has(a.id));

    if (newActions.length === 0) {
      const version = userVersions.get(userId) ?? 0;
      return { newVersion: version, applied: [], rejected: [], state: userState.get(userId) ?? {} };
    }

    const applied: string[] = [];
    const rejected: Array<{ actionId: string; reason: string }> = [];

    for (let i = 0; i < newActions.length; i += BATCH_SIZE) {
      const batch = newActions.slice(i, i + BATCH_SIZE);
      const result = await this.processBatch(userId, batch);
      applied.push(...result.applied);
      rejected.push(...result.rejected);
    }

    const newVersion = (userVersions.get(userId) ?? 0) + 1;
    userVersions.set(userId, newVersion);

    this.logger.debug(`Sync push: user=${userId}, applied=${applied.length}, rejected=${rejected.length}`);

    return { newVersion, applied, rejected, state: userState.get(userId) ?? {} };
  }

  async pull(userId: string, sinceVersion?: number): Promise<PullResponse> {
    const currentVersion = userVersions.get(userId) ?? 0;
    const since = sinceVersion ?? 0;

    if (since >= currentVersion) {
      return { version: currentVersion, deltas: [] };
    }

    const allDeltas = userDeltas.get(userId) ?? [];
    return { version: currentVersion, deltas: allDeltas.filter((d) => d.timestamp > since) };
  }

  async getStatus(userId: string): Promise<{ version: number; lastSyncAt: string | null; pendingCount: number }> {
    const version = userVersions.get(userId) ?? 0;
    const lastDeltas = userDeltas.get(userId);
    const lastSync = lastDeltas && lastDeltas.length > 0
      ? new Date(lastDeltas[lastDeltas.length - 1].timestamp).toISOString()
      : null;
    return { version, lastSyncAt: lastSync, pendingCount: 0 };
  }

  private async processBatch(
    userId: string,
    batch: SyncAction[],
  ): Promise<{ applied: string[]; rejected: Array<{ actionId: string; reason: string }> }> {
    const applied: string[] = [];
    const rejected: Array<{ actionId: string; reason: string }> = [];

    for (const action of batch) {
      const validation = this.validateAction(action);
      if (!validation.valid) {
        rejected.push({ actionId: action.id, reason: validation.error ?? 'Invalid' });
        continue;
      }

      this.applyAction(userId, action);
      appliedActions.add(action.id);
      applied.push(action.id);

      if (!userDeltas.has(userId)) userDeltas.set(userId, []);
      userDeltas.get(userId)!.push({
        petId: action.petId,
        changes: { action: action.type, args: action.args, timestamp: action.timestamp },
        timestamp: Date.now(),
      });
    }

    return { applied, rejected };
  }

  private validateAction(action: SyncAction): { valid: boolean; error?: string } {
    if (!action.id || action.id.length < 10) return { valid: false, error: 'Invalid action ID' };
    if (!action.petId) return { valid: false, error: 'Missing petId' };
    const validTypes = ['feed', 'play', 'clean', 'sleep', 'wake', 'chat', 'battle', 'evolve'];
    if (!validTypes.includes(action.type)) return { valid: false, error: `Invalid type: ${action.type}` };
    return { valid: true };
  }

  private applyAction(userId: string, action: SyncAction): void {
    let state = userState.get(userId);
    if (!state) { state = {}; userState.set(userId, state); }

    const petKey = `pet:${action.petId}`;
    let petState = (state[petKey] as Record<string, unknown>) ?? {
      hunger: 80, happiness: 80, energy: 80, hygiene: 80, health: 80,
    };

    switch (action.type) {
      case 'feed': petState.hunger = Math.min(100, Number(petState.hunger) + 15); break;
      case 'play': petState.happiness = Math.min(100, Number(petState.happiness) + 10); petState.energy = Math.max(10, Number(petState.energy) - 10); break;
      case 'clean': petState.hygiene = Math.min(100, Number(petState.hygiene) + 15); break;
      case 'sleep': petState.energy = 100; break;
      default: break;
    }

    petState.health = Math.max(10, Number(petState.health)); // Pet can't die offline
    state[petKey] = petState;
  }
}

