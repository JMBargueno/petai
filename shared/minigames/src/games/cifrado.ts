import { createRng } from '../core/rng';
import { randInt, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Cifrado (Sombra): en la penumbra se encienden glifos en un orden; hay que repetirlo. Cada ronda
 * añade un glifo. Un fallo repite la misma secuencia (sin castigo, solo se pierde tiempo).
 *
 * Techo: solo puntúa la primera vez que se acierta cada posición de la ronda, y la ronda no admite
 * respuestas hasta que se ha reproducido entera (≥ 42 ticks por glifo) → ≤ 1,43 pt/s < 2.
 * Variante accesible: reproducción más lenta y botón «repetir» cuando se quiera.
 */
export const CIFRADO = {
  GLYPHS: 6,
  START_LENGTH: 3,
  ON_TICKS: 30,
  OFF_TICKS: 12,
  PAUSE_TICKS: secondsToTicks(0.6),
} as const;

export interface CifradoState {
  rng: () => number;
  durationTicks: number;
  tick: number;
  easy: boolean;
  on: number;
  off: number;
  sequence: number[];
  phase: 'show' | 'input';
  /** Tick en que empieza (o empezó) la reproducción de la ronda. */
  showStart: number;
  /** Posición que toca pulsar en la fase de respuesta. */
  pos: number;
  /** Posiciones ya puntuadas en esta ronda (los reintentos no vuelven a puntuar). */
  reached: number;
  rounds: number;
  errors: number;
  score: number;
  last: { tick: number; glyph: number; ok: boolean } | null;
}

export type CifradoInput = { kind: 'press'; g: number } | { kind: 'replay' };

const C = CIFRADO;

/** Glifo encendido durante la reproducción (−1 si ninguno). */
export function litGlyph(s: CifradoState): number {
  if (s.phase !== 'show' || s.tick < s.showStart) return -1;
  const k = s.tick - s.showStart;
  const slot = s.on + s.off;
  const idx = Math.floor(k / slot);
  return idx < s.sequence.length && k % slot < s.on ? s.sequence[idx] : -1;
}

const showLength = (s: CifradoState) => s.sequence.length * (s.on + s.off);

function startShow(s: CifradoState) {
  s.phase = 'show';
  s.showStart = s.tick + C.PAUSE_TICKS;
  s.pos = 0;
}

export const cifrado: GameDefinition<CifradoState, CifradoInput> = {
  id: 'cifrado',
  inputKeys: { press: ['g'], replay: [] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const rng = createRng(seed);
    const easy = variant === 'easy';
    const s: CifradoState = {
      rng,
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      easy,
      on: easy ? Math.round(C.ON_TICKS * 1.5) : C.ON_TICKS,
      off: easy ? Math.round(C.OFF_TICKS * 1.5) : C.OFF_TICKS,
      sequence: Array.from({ length: C.START_LENGTH }, () => randInt(rng, C.GLYPHS)),
      phase: 'show',
      showStart: 0,
      pos: 0,
      reached: 0,
      rounds: 0,
      errors: 0,
      score: 0,
      last: null,
    };
    startShow(s);
    return s;
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'replay') return { kind: 'replay' };
    if (r.kind === 'press' && Number.isInteger(r.g) && (r.g as number) >= 0 && (r.g as number) < C.GLYPHS) return { kind: 'press', g: r.g as number };
    return null;
  },
  input(s, inp) {
    if (s.phase !== 'input') return;
    if (inp.kind === 'replay') {
      if (s.easy) startShow(s);
      return;
    }
    const ok = s.sequence[s.pos] === inp.g;
    s.last = { tick: s.tick, glyph: inp.g, ok };
    if (!ok) {
      s.errors += 1;
      startShow(s);
      return;
    }
    if (s.pos >= s.reached) {
      s.score += 1;
      s.reached = s.pos + 1;
    }
    s.pos += 1;
    if (s.pos === s.sequence.length) {
      s.rounds += 1;
      s.reached = 0;
      s.sequence.push(randInt(s.rng, C.GLYPHS));
      startShow(s);
    }
  },
  step(s) {
    if (s.phase === 'show' && s.tick >= s.showStart + showLength(s)) s.phase = 'input';
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
