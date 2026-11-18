import { createRng } from '../core/rng';
import { secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Reflejos: aparece un objetivo cada 1,0–1,4 s y dura 0,9 s. Acertar en menos de 0,4 s da 2
 * puntos; después, 1. Como mucho 1 objetivo/s × 2 = 2 pt/s, el techo del servidor.
 *
 * Variante accesible (`timing: false`): el objetivo espera hasta que se pulsa y vale siempre 1.
 */
export const REFLEX = {
  W: 340,
  H: 260,
  LIFETIME_TICKS: secondsToTicks(0.9),
  FAST_TICKS: secondsToTicks(0.4),
  MIN_GAP_S: 1.0,
  GAP_SPREAD_S: 0.4,
} as const;

export interface ReflexTarget {
  x: number;
  y: number;
  shownAt: number;
}

export interface ReflexState {
  rng: () => number;
  timed: boolean;
  durationTicks: number;
  tick: number;
  nextSpawn: number;
  target: ReflexTarget | null;
  score: number;
  hits: number;
  misses: number;
  /** Ticks de reacción de cada acierto (para estadísticas). */
  reactions: number[];
}

export type ReflexInput = { kind: 'hit' };

const R = REFLEX;
const gap = (rng: () => number) => secondsToTicks(R.MIN_GAP_S + rng() * R.GAP_SPREAD_S);

/** Reacción media en milisegundos (0 si no hay aciertos). */
export const meanReactionMs = (s: ReflexState) =>
  s.reactions.length ? Math.round((s.reactions.reduce((a, b) => a + b, 0) / s.reactions.length) * (1000 / 60)) : 0;

export const reflex: GameDefinition<ReflexState, ReflexInput> = {
  id: 'reflex',
  inputKeys: { hit: [] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const rng = createRng(seed);
    return {
      rng,
      timed: variant !== 'easy',
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      nextSpawn: gap(rng),
      target: null,
      score: 0,
      hits: 0,
      misses: 0,
      reactions: [],
    };
  },
  parseInput(raw) {
    return raw && typeof raw === 'object' && (raw as { kind?: unknown }).kind === 'hit' ? { kind: 'hit' } : null;
  },
  input(s) {
    if (!s.target) return;
    const reaction = s.tick - s.target.shownAt;
    s.score += s.timed && reaction < R.FAST_TICKS ? 2 : 1;
    s.hits += 1;
    s.reactions.push(reaction);
    s.target = null;
  },
  step(s) {
    if (s.timed && s.target && s.tick - s.target.shownAt >= R.LIFETIME_TICKS) {
      s.target = null;
      s.misses += 1;
    }
    if (s.tick >= s.nextSpawn) {
      // Sin tiempo, un objetivo pendiente se queda donde está (sigue saliendo como mucho 1 por segundo).
      if (!s.target) s.target = { x: 28 + s.rng() * (R.W - 56), y: 28 + s.rng() * (R.H - 56), shownAt: s.tick };
      s.nextSpawn = s.tick + gap(s.rng);
    }
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
