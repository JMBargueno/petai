import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HighlightService, HighlightInfo, BattleLogEntry } from './highlight.service';

/**
 * Spectator Service — manages live combat spectating.
 * Feature 023: Combat Spectator
 *
 * Handles subscriptions, 10s delay buffer, and live state queries.
 */

export interface SpectatorSubscription {
  battleId: string;
  userId: string;
  joinedAt: number;
  lastRoundSeen: number;
  isActive: boolean;
}

export interface LiveBattleState {
  battleId: string;
  currentRound: number;
  visibleRound: number; // delayed by 10s
  attacker: { petName: string; hp: number; maxHp: number };
  defender: { petName: string; hp: number; maxHp: number };
  isFinished: boolean;
  spectators: number;
}

const MAX_SPECTATORS = 100;
const DELAY_MS = 10000; // 10s delay

// In-memory stores (production: Redis)
const battleBuffers = new Map<string, Array<{ round: number; data: unknown; timestamp: number }>>();
const activeSubscriptions = new Map<string, SpectatorSubscription[]>();

@Injectable()
export class SpectatorService {
  private readonly logger = new Logger(SpectatorService.name);

  constructor(private readonly highlightService: HighlightService) {}

  /**
   * Subscribe a user to a battle.
   */
  subscribe(battleId: string, userId: string): SpectatorSubscription {
    let subs = activeSubscriptions.get(battleId);
    if (!subs) {
      subs = [];
      activeSubscriptions.set(battleId, subs);
    }

    if (subs.length >= MAX_SPECTATORS) {
      throw new HttpException(
        `Maximum spectators reached (${MAX_SPECTATORS})`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Check if already subscribed
    const existing = subs.find((s) => s.userId === userId && s.isActive);
    if (existing) return existing;

    const subscription: SpectatorSubscription = {
      battleId,
      userId,
      joinedAt: Date.now(),
      lastRoundSeen: 0,
      isActive: true,
    };

    subs.push(subscription);
    this.logger.debug(`Spectator subscribed: ${userId} → battle ${battleId} (${subs.length} total)`);

    return subscription;
  }

  /**
   * Unsubscribe a user from a battle.
   */
  unsubscribe(battleId: string, userId: string): void {
    const subs = activeSubscriptions.get(battleId);
    if (!subs) return;

    const sub = subs.find((s) => s.userId === userId && s.isActive);
    if (sub) sub.isActive = false;
  }

  /**
   * Get live battle state with 10s delay applied.
   */
  getLiveState(battleId: string): LiveBattleState | null {
    const buffer = battleBuffers.get(battleId);
    if (!buffer || buffer.length === 0) return null;

    const now = Date.now();
    const visibleTimestamp = now - DELAY_MS;

    // Find the last round that is visible (within delay window)
    let visibleRound = 0;
    let visibleEntry: BattleLogEntry | null = null;

    for (const entry of buffer) {
      if (entry.timestamp <= visibleTimestamp) {
        visibleRound = entry.round;
        visibleEntry = entry.data as BattleLogEntry;
      } else {
        break;
      }
    }

    const currentRound = buffer[buffer.length - 1].round;
    const lastEntry = buffer[buffer.length - 1].data as BattleLogEntry;

    return {
      battleId,
      currentRound,
      visibleRound,
      attacker: {
        petName: `Attacker`,
        hp: visibleEntry?.attackerHp ?? lastEntry.attackerHp,
        maxHp: 100,
      },
      defender: {
        petName: `Defender`,
        hp: visibleEntry?.defenderHp ?? lastEntry.defenderHp,
        maxHp: 100,
      },
      isFinished: lastEntry.attackerHp <= 0 || lastEntry.defenderHp <= 0,
      spectators: (activeSubscriptions.get(battleId) ?? []).filter((s) => s.isActive).length,
    };
  }

  /**
   * Add a round to the battle buffer (called by BattlesModule).
   */
  addRound(battleId: string, round: number, data: BattleLogEntry): void {
    let buffer = battleBuffers.get(battleId);
    if (!buffer) {
      buffer = [];
      battleBuffers.set(battleId, buffer);
    }
    buffer.push({ round, data, timestamp: Date.now() });

    // Keep only last 100 rounds to limit memory
    if (buffer.length > 100) {
      buffer.splice(0, buffer.length - 100);
    }
  }

  /**
   * Get highlights for the current week (top 20 by rating).
   */
  async getHighlights(limit: number = 20): Promise<HighlightInfo[]> {
    // In production: query Prisma Highlight table
    // For now, return highlights from in-memory analysis
    const highlights: HighlightInfo[] = [];

    for (const [battleId, buffer] of battleBuffers.entries()) {
      if (buffer.length === 0) continue;
      const log = buffer.map((e) => e.data as BattleLogEntry);
      const info = this.highlightService.analyze(battleId, log);
      if (info) highlights.push(info);
    }

    return highlights
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }
}
