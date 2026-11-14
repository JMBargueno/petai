import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { simulateBattle } from '../battles/combat/engine';
import { hashSeed } from '../battles/combat/rng';
import { Fighter } from '../battles/combat/types';
import { GameDataService } from '../game-data/game-data.service';

const BRACKET_SIZE = 64;
const TOTAL_ROUNDS = 6; // log2(64)
/** Máximo de una columna `Int` (Postgres INT4): las semillas de combate deben caber aquí. */
const MAX_SEED = 0x7fffffff;

/**
 * Orden de semilla para un bracket de `size` hojas: `order[pos]` es la semilla (1-based) que ocupa
 * la hoja `pos`. Así la mejor semilla (pos 0) se enfrenta a la última hoja disponible y el avance
 * del ganador usa el criterio estándar `floor(slot/2)` de la siguiente ronda.
 */
function seedOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  const half = seedOrder(size / 2);
  const out: number[] = [];
  for (const s of half) out.push(s, size + 1 - s);
  return out;
}

@Injectable()
export class BracketService {
  private readonly logger = new Logger(BracketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  /**
   * Construye un bracket determinista de 64 hojas a partir de las mascotas ya ordenadas por ELO
   * (mejor primera). Ronda 1: la hoja `2s` (petA) juega contra la hoja `2s+1` (petB); las hojas
   * vacías son bye. Ronda ≥2 se rellena con el avance del ganador (`advanceWinner`). `seed1`/
   * `seed2` son semillas de combate (reproducibilidad), acotadas al rango INT4, no índices.
   */
  async buildBracket(tournamentId: string, petIds: string[]) {
    const order = seedOrder(BRACKET_SIZE); // [pos] → semilla 1-based
    const leaves: (string | null)[] = Array(BRACKET_SIZE).fill(null);
    for (let pos = 0; pos < BRACKET_SIZE; pos++) {
      const idx = order[pos] - 1;
      leaves[pos] = idx < petIds.length ? petIds[idx] : null;
    }

    const matches: { round: number; slot: number; petAId: string | null; petBId: string | null; seed1: number; seed2: number }[] = [];

    // Ronda 1: hoja 2s (petA) vs hoja 2s+1 (petB)
    for (let slot = 0; slot < BRACKET_SIZE / 2; slot++) {
      const baseSeed = hashSeed(`${tournamentId}:r1:${slot}`);
      matches.push({
        round: 1, slot,
        petAId: leaves[2 * slot], petBId: leaves[2 * slot + 1],
        seed1: (baseSeed + 1) & MAX_SEED, seed2: (baseSeed + 2) & MAX_SEED,
      });
    }
    // Rondas 2–6: los participantes se rellenan con el avance del ganador
    for (let round = 2; round <= TOTAL_ROUNDS; round++) {
      const count = BRACKET_SIZE / 2 ** round;
      for (let slot = 0; slot < count; slot++) {
        const baseSeed = hashSeed(`${tournamentId}:r${round}:${slot}`);
        matches.push({
          round, slot, petAId: null, petBId: null,
          seed1: (baseSeed + 1) & MAX_SEED, seed2: (baseSeed + 2) & MAX_SEED,
        });
      }
    }

    await this.prisma.tournamentMatch.createMany({
      data: matches.map((m) => ({
        tournamentId, round: m.round, slot: m.slot, bestOf: 2,
        seed1: m.seed1, seed2: m.seed2, petAId: m.petAId, petBId: m.petBId, status: 'pending',
      })),
    });

    this.logger.log(`Bracket built for tournament ${tournamentId}: ${matches.length} matches`);
    return { totalMatches: matches.length, totalRounds: TOTAL_ROUNDS, bracketSize: BRACKET_SIZE };
  }

  /**
   * Resuelve una partida best-of-2 (determinista por semilla) y guarda el petId real del ganador.
   * Empate 1-1 → desempate por ELO (guardado en el metadata del luchador).
   */
  async resolveMatch(tournamentId: string, matchId: string, fighterA: Fighter, fighterB: Fighter): Promise<{ winner: 0 | 1; winnerPetId: string }> {
    const match = await this.prisma.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error(`Match ${matchId} no encontrado`);

    const result1 = simulateBattle(fighterA, fighterB, match.seed1, this.combatConfig());
    const result2 = simulateBattle(fighterA, fighterB, match.seed2, this.combatConfig());

    let winner: 0 | 1;
    if (result1.winner === 0 && result2.winner === 0) winner = 0;
    else if (result1.winner === 1 && result2.winner === 1) winner = 1;
    else if (result1.winner === 0) winner = 0; // gana la 1ª
    else if (result2.winner === 1) winner = 1; // gana la 2ª
    else winner = (fighterA as any).elo >= (fighterB as any).elo ? 0 : 1; // 1-1 → ELO

    const winnerPetId = winner === 0 ? fighterA.petId! : fighterB.petId!;
    await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: 'resolved', winnerId: winnerPetId, resolvedAt: new Date(), log: { result1: result1.log, result2: result2.log, winner } as any },
    });
    return { winner, winnerPetId };
  }

  /** Marca un bye (un solo participante): ese pet avanza sin pelear. */
  async markBye(matchId: string, winnerPetId: string): Promise<void> {
    await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: 'resolved', winnerId: winnerPetId, resolvedAt: new Date(), log: { bye: true } as any },
    });
  }

  /** Marca una partida vacía (subárbol sin participantes) como resuelta para no bloquear el avance. */
  async markVoid(matchId: string): Promise<void> {
    await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: 'resolved', winnerId: null, resolvedAt: new Date(), log: { void: true } as any },
    });
  }

  /**
   * Avanza `winnerPetId` a la siguiente ronda: la partida (round, slot) alimenta la partida
   * `floor(slot/2)` de `round+1` como petA si `slot` es par y petB si es impar.
   */
  async advanceWinner(tournamentId: string, round: number, slot: number, winnerPetId: string): Promise<void> {
    if (round >= TOTAL_ROUNDS) return;
    const nextSlot = Math.floor(slot / 2);
    const field = slot % 2 === 0 ? 'petAId' : 'petBId';
    await this.prisma.tournamentMatch.update({
      where: { tournamentId_round_slot: { tournamentId, round: round + 1, slot: nextSlot } },
      data: { [field]: winnerPetId } as any,
    });
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
   * Vista del bracket para mostrar: resuelve petA/petB desde los petId reales guardados en cada
   * partida (ya no desde un índice de inscripción).
   */
  async getBracketView(tournamentId: string) {
    const matches = await this.prisma.tournamentMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: 'asc' }, { slot: 'asc' }],
    });

    const petIds = Array.from(new Set(matches.flatMap((m) => [m.petAId, m.petBId]).filter((x): x is string => !!x)));
    const pets = petIds.length
      ? await this.prisma.pet.findMany({
          where: { id: { in: petIds } },
          select: { id: true, nickname: true, elo: true, level: true, species: { select: { element: true, name: true } } },
        })
      : [];
    const petById = new Map(pets.map((p) => [p.id, p]));
    const fmt = (id?: string | null) => {
      const p = id ? petById.get(id) : undefined;
      return p ? { name: p.nickname || 'Pet', elo: p.elo, element: p.species?.element } : null;
    };

    const rounds: Record<number, any[]> = {};
    for (const m of matches) {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push({
        id: m.id,
        slot: m.slot,
        status: m.status,
        winnerId: m.winnerId,
        petA: fmt(m.petAId),
        petB: fmt(m.petBId),
      });
    }

    const entries = await this.prisma.tournamentEntry.findMany({
      where: { tournamentId },
      include: { pet: { select: { id: true, nickname: true, elo: true, level: true, species: { select: { element: true, name: true } } } } },
    });

    return { rounds, entries };
  }
}