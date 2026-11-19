import { createRng } from '../core/rng';
import { secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Pesca de Códices (`reflex`). Los Códices Latentes afloran un instante en las corrientes del Telar
 * de Mulberry: hay que tirar del sedal antes de que se hundan, sin picar en los que están sin tejer.
 *
 * - Aflora algo cada 1,0–1,4 s y dura 0,9 s. Pescar un Códice en menos de 0,4 s da 2 puntos; después, 1.
 * - **Señuelos:** una de cada cinco veces aflora un Códice sin tejer. Tirar de él no da nada y enreda
 *   el sedal 1 s, durante el que no se puede pescar. Dejarlo pasar no cuenta como fallo.
 *
 * Techo: como mucho 1 Códice/s × 2 = 2 pt/s; los señuelos solo lo bajan.
 *
 * Variante accesible (`timing: false`): el Códice espera hasta que se pesca, vale siempre 1 y no hay
 * señuelos.
 */
export const REFLEX = {
  W: 340,
  H: 260,
  LIFETIME_TICKS: secondsToTicks(0.9),
  FAST_TICKS: secondsToTicks(0.4),
  MIN_GAP_S: 1.0,
  GAP_SPREAD_S: 0.4,
  LURE_CHANCE: 0.2,
  TANGLE_TICKS: secondsToTicks(1),
  /** Franja de abajo donde no aflora nada: es la orilla, donde espera el Pockai. */
  SHORE: 50,
} as const;

export interface ReflexTarget {
  x: number;
  y: number;
  shownAt: number;
  /** Es un Códice sin tejer: no hay que pescarlo. */
  lure: boolean;
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
  /** Señuelos en los que se ha picado. */
  lures: number;
  /** Hasta este tick el sedal está enredado y no se puede pescar. */
  tangledUntil: number;
  /** Lo último que pasó (para que la vista reaccione). */
  last: { tick: number; kind: 'fast' | 'catch' | 'lure' | 'miss' } | null;
  /** Ticks de reacción de cada acierto (para estadísticas). */
  reactions: number[];
}

export type ReflexInput = { kind: 'hit' };

const R = REFLEX;
const gap = (rng: () => number) => secondsToTicks(R.MIN_GAP_S + rng() * R.GAP_SPREAD_S);
/** ¿Está el sedal enredado? */
export const isTangled = (s: Pick<ReflexState, 'tick' | 'tangledUntil'>) => s.tick < s.tangledUntil;

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
      lures: 0,
      tangledUntil: 0,
      last: null,
      reactions: [],
    };
  },
  parseInput(raw) {
    return raw && typeof raw === 'object' && (raw as { kind?: unknown }).kind === 'hit' ? { kind: 'hit' } : null;
  },
  input(s) {
    if (!s.target || isTangled(s)) return;
    if (s.target.lure) {
      s.lures += 1;
      s.tangledUntil = s.tick + R.TANGLE_TICKS;
      s.last = { tick: s.tick, kind: 'lure' };
      s.target = null;
      return;
    }
    const reaction = s.tick - s.target.shownAt;
    const fast = s.timed && reaction < R.FAST_TICKS;
    s.score += fast ? 2 : 1;
    s.last = { tick: s.tick, kind: fast ? 'fast' : 'catch' };
    s.hits += 1;
    s.reactions.push(reaction);
    s.target = null;
  },
  step(s) {
    if (s.timed && s.target && s.tick - s.target.shownAt >= R.LIFETIME_TICKS) {
      // Un señuelo que se deja pasar no es un fallo: era lo que había que hacer.
      if (!s.target.lure) {
        s.misses += 1;
        s.last = { tick: s.tick, kind: 'miss' };
      }
      s.target = null;
    }
    if (s.tick >= s.nextSpawn) {
      // Sin tiempo, un objetivo pendiente se queda donde está (sigue saliendo como mucho 1 por segundo).
      // Siempre tres tiradas por aparición: el orden del generador es parte de las reglas.
      if (!s.target) {
        const x = 28 + s.rng() * (R.W - 56);
        const y = 28 + s.rng() * (R.H - 56 - R.SHORE);
        const lure = s.rng() < R.LURE_CHANCE && s.timed;
        s.target = { x, y, shownAt: s.tick, lure };
      }
      s.nextSpawn = s.tick + gap(s.rng);
    }
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
