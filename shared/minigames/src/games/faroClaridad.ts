import { createRng } from '../core/rng';
import { randInt, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Faro de Claridad (Luz): una pantalla a oscuras de 8×6 casillas con bits corruptos que se
 * extienden. El haz ilumina una casilla; si se mantiene 0,5 s sobre un bit corrupto, lo purifica
 * (+1). Si la corrupción cubre el 60 % de la pantalla, la partida acaba antes.
 *
 * Techo: el haz cubre una casilla y purificar exige 30 ticks seguidos → ≤ 2 pt/s.
 * Variante accesible: la corrupción se extiende a la mitad de ritmo.
 */
export const FARO = {
  COLS: 8,
  ROWS: 6,
  PURIFY_TICKS: 30,
  SPREAD_TICKS: secondsToTicks(2),
  SPREAD_CHANCE: 0.35,
  START_SEEDS: 3,
  LOSE_RATIO: 0.6,
} as const;

export interface FaroState {
  rng: () => number;
  durationTicks: number;
  tick: number;
  spreadTicks: number;
  corrupt: boolean[];
  aim: number;
  progress: number;
  score: number;
  /** La corrupción ha ganado: fin anticipado. */
  overrun: boolean;
  last: { tick: number; cell: number } | null;
}

export type FaroInput = { kind: 'aim'; c: number };

const F = FARO;
const CELLS = F.COLS * F.ROWS;

export const corruptCount = (s: FaroState) => s.corrupt.filter(Boolean).length;

function seed(s: FaroState, n: number) {
  for (let k = 0; k < n; k++) {
    const clean = s.corrupt.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    if (!clean.length) return;
    s.corrupt[clean[randInt(s.rng, clean.length)]] = true;
  }
}

export const faroClaridad: GameDefinition<FaroState, FaroInput> = {
  id: 'faro_claridad',
  inputKeys: { aim: ['c'] },
  coalesce: ['aim'],
  init({ seed: sd, durationSeconds, variant }: GameOptions) {
    const s: FaroState = {
      rng: createRng(sd),
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      spreadTicks: variant === 'easy' ? F.SPREAD_TICKS * 2 : F.SPREAD_TICKS,
      corrupt: new Array<boolean>(CELLS).fill(false),
      aim: -1,
      progress: 0,
      score: 0,
      overrun: false,
      last: null,
    };
    seed(s, F.START_SEEDS);
    return s;
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'aim' && Number.isInteger(r.c) && (r.c as number) >= -1 && (r.c as number) < CELLS) return { kind: 'aim', c: r.c as number };
    return null;
  },
  input(s, { c }) {
    if (c !== s.aim) {
      s.aim = c;
      s.progress = 0;
    }
  },
  step(s) {
    if (s.aim >= 0 && s.corrupt[s.aim]) {
      s.progress += 1;
      if (s.progress >= F.PURIFY_TICKS) {
        s.corrupt[s.aim] = false;
        s.score += 1;
        s.progress = 0;
        s.last = { tick: s.tick, cell: s.aim };
      }
    } else {
      s.progress = 0;
    }

    if (s.tick > 0 && s.tick % s.spreadTicks === 0) {
      const next = [...s.corrupt];
      s.corrupt.forEach((c, i) => {
        if (!c || s.rng() >= F.SPREAD_CHANCE) return;
        const x = i % F.COLS;
        const y = Math.floor(i / F.COLS);
        const options = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < F.COLS && ny < F.ROWS);
        const [nx, ny] = options[randInt(s.rng, options.length)];
        next[ny * F.COLS + nx] = true;
      });
      s.corrupt = next;
      if (corruptCount(s) === 0) seed(s, 2);
      if (corruptCount(s) > CELLS * F.LOSE_RATIO) s.overrun = true;
    }
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.overrun || s.tick >= s.durationTicks,
};
