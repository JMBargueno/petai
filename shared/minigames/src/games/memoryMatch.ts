import { createRng, shuffle } from '../core/rng';
import { TICKS_PER_SECOND, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Parejas de memoria: 8 parejas boca abajo (4 en la variante accesible). 2 puntos por pareja +
 * bonus de rapidez (hasta 8, solo si se completa) − 1 por cada 3 fallos. Máximo 24, por debajo de
 * 2 pt/s × 15 s de duración mínima.
 */
export const MEMORY_MATCH = {
  PAIRS: 8,
  EASY_PAIRS: 4,
  MAX_CARDS: 16,
  FLIP_BACK_TICKS: secondsToTicks(0.7),
  MAX_BONUS: 8,
} as const;

export interface MemoryMatchState {
  durationTicks: number;
  tick: number;
  pairs: number;
  /** Variante accesible: la vista resalta la pareja de la carta destapada. */
  hints: boolean;
  /** Cara de cada carta (0..pairs-1). */
  deck: number[];
  flipped: number[];
  matched: boolean[];
  /** Tick hasta el que el tablero está bloqueado mostrando un fallo; −1 si no. */
  lockedUntil: number;
  misses: number;
  /** Tick en que se emparejó la última carta; −1 si no ha terminado. */
  completedAt: number;
}

export type MemoryMatchInput = { kind: 'flip'; i: number };

const M = MEMORY_MATCH;

export const pairsFound = (s: MemoryMatchState) => s.matched.filter(Boolean).length / 2;

export const memoryMatch: GameDefinition<MemoryMatchState, MemoryMatchInput> = {
  id: 'memory_match',
  inputKeys: { flip: ['i'] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const easy = variant === 'easy';
    const pairs = easy ? M.EASY_PAIRS : M.PAIRS;
    const faces = Array.from({ length: pairs }, (_, i) => i);
    const deck = shuffle([...faces, ...faces], createRng(seed));
    return {
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      pairs,
      hints: easy,
      deck,
      flipped: [],
      matched: deck.map(() => false),
      lockedUntil: -1,
      misses: 0,
      completedAt: -1,
    };
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'flip' && Number.isInteger(r.i) && (r.i as number) >= 0 && (r.i as number) < M.MAX_CARDS) {
      return { kind: 'flip', i: r.i as number };
    }
    return null;
  },
  input(s, { i }) {
    if (i >= s.deck.length || s.lockedUntil >= 0 || s.flipped.includes(i) || s.matched[i]) return;
    s.flipped.push(i);
    if (s.flipped.length < 2) return;
    const [a, b] = s.flipped;
    if (s.deck[a] === s.deck[b]) {
      s.matched[a] = s.matched[b] = true;
      s.flipped = [];
      if (s.matched.every(Boolean)) s.completedAt = s.tick;
    } else {
      s.misses += 1;
      s.lockedUntil = s.tick + M.FLIP_BACK_TICKS;
    }
  },
  step(s) {
    if (s.lockedUntil >= 0 && s.tick >= s.lockedUntil) {
      s.flipped = [];
      s.lockedUntil = -1;
    }
    s.tick += 1;
  },
  score(s) {
    let bonus = 0;
    if (s.completedAt >= 0) {
      const timeLeft = (s.durationTicks - s.completedAt) / TICKS_PER_SECOND;
      bonus = Math.min(M.MAX_BONUS, Math.floor(timeLeft / 8));
    }
    return Math.max(0, pairsFound(s) * 2 + bonus - Math.floor(s.misses / 3));
  },
  over: (s) => s.completedAt >= 0 || s.tick >= s.durationTicks,
};
