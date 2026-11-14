import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { simulateBattle } from '../battles/combat/engine';
import { hashSeed } from '../battles/combat/rng';
import { generateBot } from '../battles/combat/bots';
import { Fighter } from '../battles/combat/types';
import { GameDataService } from '../game-data/game-data.service';

const BRACKET_SIZE = 64;
const TOTAL_ROUNDS = 6; // log2(64)

@Injectable()
export class BracketService {
  private readonly logger = new Logger(BracketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  /**
   * Build a deterministic bracket from 64 pet entries.
   * Seeding: 1 vs 64, 2 vs 63, 3 vs 62, ... in round 1.
   */
  async buildBracket(tournamentId: string, petIds: string[]) {
    // Ensure exactly BRACKET_SIZE entries (pad with 'bot' if needed)
    const slots: (string | null)[] = Array(BRACKET_SIZE).fill(null);
    for (let i = 0; i < petIds.length && i < BRACKET_SIZE; i++) {
      slots[i] = petIds[i];
    }

    // Build round 1 pairs
    const round1Pairs: { slotA: number; slotB: number }[] = [];
    for (let i = 0; i < BRACKET_SIZE / 2; i++) {
      round1Pairs.push({ slotA: i, slotB: BRACKET_SIZE - 1 - i });
    }

    // Create all matches
    const matches: { round: number; slot: number; slotA: number; slotB: number; seed1: number; seed2: number }[] = [];

    // Round 1
    round1Pairs.forEach((pair, slot) => {
      const baseSeed = hashSeed(`${tournamentId}:r1:${slot}`);
      matches.push({
        round: 1,
        slot,
        slotA: pair.slotA,
        slotB: pair.slotB,
        seed1: (baseSeed + 1) >>> 0,
        seed2: (baseSeed + 2) >>> 0,
      });
    });

    // Rounds 2–6
    for (let round = 2; round <= TOTAL_ROUNDS; round++) {
      const numMatches = BRACKET_SIZE / Math.pow(2, round);
      for (let slot = 0; slot < numMatches; slot++) {
        const baseSeed = hashSeed(`${tournamentId}:r${round}:${slot}`);
        matches.push({
          round,
          slot,
          slotA: slot * 2,
          slotB: slot * 2 + 1,
          seed1: (baseSeed + 1) >>> 0,
          seed2: (baseSeed + 2) >>> 0,
        });
      }
    }

    // Persist all matches
    await this.prisma.tournamentMatch.createMany({
      data: matches.map((m) => ({
        tournamentId,
        round: m.round,
        slot: m.slot,
        bestOf: 2,
        seed1: m.seed1,
        seed2: m.seed2,
        status: 'pending',
      })),
    });

    this.logger.log(`Bracket built for tournament ${tournamentId}: ${matches.length} matches`);
    return { totalMatches: matches.length, totalRounds: TOTAL_ROUNDS, bracketSize: BRACKET_SIZE };
  }

  /**
   * Resolve a single match: best-of-2 combat determinism.
   */
  async resolveMatch(tournamentId: string, matchId: string, fighterA: Fighter, fighterB: Fighter) {
    const match = await this.prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) return null;

    const result1 = simulateBattle(fighterA, fighterB, match.seed1, this.combatConfig());
    const result2 = simulateBattle(fighterA, fighterB, match.seed2, this.combatConfig());

    let winner: 0 | 1;
    if (result1.winner === 0 && result2.winner === 0) {
      winner = 0;
    } else if (result1.winner === 1 && result2.winner === 1) {
      winner = 1;
    } else if (result1.winner === 0) {
      // 1-0, need tie-break: whoever wins the 2nd already decided
      winner = 0;
    } else if (result2.winner === 1) {
      winner = 1;
    } else {
      // 1-1 tie → tie-break by ELO (stored in fighter metadata)
      winner = (fighterA as any).elo >= (fighterB as any).elo ? 0 : 1;
    }

    await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data: {
        status: 'resolved',
        winnerId: winner === 0 ? 'A' : 'B',
        resolvedAt: new Date(),
        log: { result1: result1.log, result2: result2.log, winner } as any,
      },
    });

    return { winner, result1, result2 };
  }

  private combatConfig() {
    const b = this.gameData.getBalance();
    return {
      maxRounds: 30, hpMultiplier: b.combats?.hpMultiplier ?? 1.0, damageScale: b.combats?.damageScale ?? 1.0,
      critChance: b.combats?.critChance ?? 0.1, critMultiplier: b.combats?.critMultiplier ?? 1.5,
      elementAdvantage: b.combats?.elementAdvantage ?? 1.5, elementDisadvantage: b.combats?.elementDisadvantage ?? 0.75,
      burnPctPerTurn: b.combats?.burnPctPerTurn ?? 0.02, guardDefMultiplier: b.combats?.guardDefMultiplier ?? 1.5,
      mood: { minMultiplier: b.combats?.mood?.minMultiplier ?? 0.8, sickMultiplier: b.combats?.mood?.sickMultiplier ?? 0.9 },
    };
  }

  /**
   * Get the bracket structure for display.
   */
  async getBracketView(tournamentId: string) {
    const matches = await this.prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { slot: 'asc' }],
    });

    const entries = await this.prisma.tournamentEntry.findMany({
      where: { tournamentId },
      include: { pet: { select: { id: true, nickname: true, elo: true, level: true, species: { select: { element: true, name: true } } } } },
    });

    const rounds: Record<number, any[]> = {};
    for (const m of matches) {
      if (!rounds[m.round]) rounds[m.round] = [];
      const entryA = entries[m.seed1];
      const entryB = entries[m.seed2];
      rounds[m.round].push({
        id: m.id,
        slot: m.slot,
        status: m.status,
        winnerId: m.winnerId,
        petA: entryA ? { name: entryA.pet?.nickname || 'Pet', elo: entryA.pet?.elo, element: entryA.pet?.species?.element } : null,
        petB: entryB ? { name: entryB.pet?.nickname || 'Pet', elo: entryB.pet?.elo, element: entryB.pet?.species?.element } : null,
      });
    }

    return { rounds, entries };
  }
}