import { Injectable, Logger } from '@nestjs/common';

/**
 * Highlight Service — detects and rates combat highlights.
 * Feature 023: Combat Spectator
 *
 * Automatically detects "exciting" battles:
 * - Critical hit >50% damage
 * - Comeback (from <20% HP to win)
 * - Extended battle (>30 rounds)
 *
 * Calculates rating score for feed ranking.
 */

export interface BattleLogEntry {
  round: number;
  attackerDamage: number;
  defenderDamage: number;
  isCritical: boolean;
  attackerHp: number;
  defenderHp: number;
}

export interface HighlightInfo {
  battleId: string;
  type: 'critical' | 'comeback' | 'long_battle' | 'multiple';
  rating: number;
  highlights: string[];
  totalRounds: number;
  criticalCount: number;
  hasComeback: boolean;
}

const CRITICAL_DAMAGE_THRESHOLD = 0.5; // >50% of max HP
const COMEBACK_HP_THRESHOLD = 20; // <20% HP
const LONG_BATTLE_ROUNDS = 30;

@Injectable()
export class HighlightService {
  private readonly logger = new Logger(HighlightService.name);

  /**
   * Analyze a battle log and determine if it qualifies as a highlight.
   */
  analyze(battleId: string, log: BattleLogEntry[]): HighlightInfo | null {
    if (!log || log.length === 0) return null;

    const totalRounds = log.length;
    const criticalHits = log.filter((e) => e.isCritical);
    const criticalCount = criticalHits.length;

    // Check critical hits (>50% damage)
    const hasCritical = criticalHits.some((c) => c.attackerDamage > CRITICAL_DAMAGE_THRESHOLD * 100);

    // Check comeback (attacker or defender from <20% HP to winning)
    const hasComeback = this.detectComeback(log);

    // Check long battle
    const isLong = totalRounds > LONG_BATTLE_ROUNDS;

    // Must have at least one highlight condition
    if (!hasCritical && !hasComeback && !isLong) return null;

    // Determine type
    let type: HighlightInfo['type'];
    if (hasCritical && hasComeback && isLong) type = 'multiple';
    else if (hasCritical) type = 'critical';
    else if (hasComeback) type = 'comeback';
    else type = 'long_battle';

    // Calculate rating
    const rating = this.calculateRating(totalRounds, criticalCount, hasComeback, isLong);

    const highlights: string[] = [];
    if (hasCritical) highlights.push(`Critical hits: ${criticalCount}`);
    if (hasComeback) highlights.push('Comeback from <20% HP');
    if (isLong) highlights.push(`${totalRounds} rounds`);

    return {
      battleId,
      type,
      rating,
      highlights,
      totalRounds,
      criticalCount,
      hasComeback,
    };
  }

  /**
   * Detect if a player came back from <20% HP to win.
   */
  private detectComeback(log: BattleLogEntry[]): boolean {
    if (log.length === 0) return false;

    const lastEntry = log[log.length - 1];
    const winnerIsAttacker = lastEntry.attackerHp > lastEntry.defenderHp;

    // Check if winner was at <20% HP at some point
    for (const entry of log) {
      const winnerHp = winnerIsAttacker ? entry.attackerHp : entry.defenderHp;
      if (winnerHp < COMEBACK_HP_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate highlight rating (0-100 scale).
   */
  private calculateRating(
    totalRounds: number,
    criticalCount: number,
    hasComeback: boolean,
    isLong: boolean,
  ): number {
    let rating = 0;

    // Critical hits: 10 points each, max 40
    rating += Math.min(criticalCount * 10, 40);

    // Comeback: 30 points
    if (hasComeback) rating += 30;

    // Long battle: base 10, +1 per 5 rounds over 30, max 30
    if (isLong) {
      rating += Math.min(10 + Math.floor((totalRounds - LONG_BATTLE_ROUNDS) / 5) * 2, 30);
    }

    // Multi-highlight bonus: +10 if multiple types
    const typeCount = [hasComeback, isLong, criticalCount > 0].filter(Boolean).length;
    if (typeCount > 1) rating += 10;

    return Math.min(rating, 100);
  }
}
