import { createRng, shuffle } from '../core/rng';
import { TICKS_PER_SECOND, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Cristal de Recuerdos (`memory_match`). El Cristal guarda lo que habéis vivido en facetas
 * desordenadas; emparejarlas las fija para que no se borren.
 *
 * - 8 parejas de facetas (4 en la variante accesible).
 * - **Destello:** al empezar, el Cristal enseña todas las facetas 2 s (3 s en la accesible) y luego
 *   las apaga. Mientras dura no se puede tocar nada.
 * - 2 puntos por pareja + bonus de rapidez (hasta 8, solo si se completa) − 1 por cada 3 fallos.
 *
 * Techo: la puntuación máxima es 24 y no depende del tiempo, así que cabe en 3 pt/s × 8 s de duración
 * mínima aunque el destello permita acabar antes.
 */
export const MEMORY_MATCH = {
  PAIRS: 8,
  EASY_PAIRS: 4,
  MAX_CARDS: 16,
  FLIP_BACK_TICKS: secondsToTicks(0.7),
  MAX_BONUS: 8,
  PEEK_TICKS: secondsToTicks(2),
  EASY_PEEK_TICKS: secondsToTicks(3),
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
  /** Hasta este tick dura el destello inicial: todas las facetas a la vista y sin poder tocar. */
  peekUntil: number;
  /** Último par destapado, acertado o no (para que la vista reaccione). */
  last: { tick: number; ok: boolean } | null;
  /** Tick en que se emparejó la última carta; −1 si no ha terminado. */
  completedAt: number;
}

export type MemoryMatchInput = { kind: 'flip'; i: number };

const M = MEMORY_MATCH;

export const pairsFound = (s: MemoryMatchState) => s.matched.filter(Boolean).length / 2;
/** ¿Sigue el destello inicial? */
export const isPeeking = (s: Pick<MemoryMatchState, 'tick' | 'peekUntil'>) => s.tick < s.peekUntil;

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
      peekUntil: easy ? M.EASY_PEEK_TICKS : M.PEEK_TICKS,
      last: null,
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
    if (i >= s.deck.length || isPeeking(s) || s.lockedUntil >= 0 || s.flipped.includes(i) || s.matched[i]) return;
    s.flipped.push(i);
    if (s.flipped.length < 2) return;
    const [a, b] = s.flipped;
    if (s.deck[a] === s.deck[b]) {
      s.matched[a] = s.matched[b] = true;
      s.flipped = [];
      s.last = { tick: s.tick, ok: true };
      if (s.matched.every(Boolean)) s.completedAt = s.tick;
    } else {
      s.misses += 1;
      s.last = { tick: s.tick, ok: false };
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
