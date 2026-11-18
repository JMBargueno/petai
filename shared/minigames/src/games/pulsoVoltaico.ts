import { createRng } from '../core/rng';
import { randInt, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Pulso Voltaico (Eléctrico): pulsos que bajan por 3 carriles a ritmo; hay que pulsar el carril
 * cuando el pulso cruza la línea. Perfecto (±4 ticks) 2 puntos, bien (±9) 1.
 *
 * Techo: las notas están separadas al menos 2 pulsos de un tempo de 90–130 BPM (≥ 55 ticks) y la
 * primera llega a los 2 s → como mucho ~1,1 notas/s × 2 = 2,2 pt/s < 3.
 * Variante accesible: caída 1,5 veces más lenta y ventanas ×3.
 */
export const PULSO = {
  LANES: 3,
  FALL_TICKS: 90,
  PERFECT: 4,
  GOOD: 9,
  LEAD_TICKS: secondsToTicks(2),
  MIN_GAP: 55,
} as const;

export type Grade = 'perfect' | 'good' | 'miss';

export interface PulseNote {
  hit: number;
  lane: number;
  grade: Grade | null;
}

export interface PulsoState {
  durationTicks: number;
  tick: number;
  fallTicks: number;
  perfect: number;
  good: number;
  bpm: number;
  notes: PulseNote[];
  score: number;
  combo: number;
  maxCombo: number;
  last: { tick: number; lane: number; grade: Grade } | null;
}

export type PulsoInput = { kind: 'tap'; lane: number };

const P = PULSO;

export const pulsoVoltaico: GameDefinition<PulsoState, PulsoInput> = {
  id: 'pulso_voltaico',
  inputKeys: { tap: ['lane'] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const easy = variant === 'easy';
    const rng = createRng(seed);
    const durationTicks = secondsToTicks(durationSeconds);
    const bpm = 90 + randInt(rng, 41);
    const beat = 3600 / bpm;
    const notes: PulseNote[] = [];
    // Frases de 4 notas: dentro de la frase, 2 pulsos; entre frases, 3 o 4 (respiro).
    let t = P.LEAD_TICKS;
    let lane = randInt(rng, P.LANES);
    while (t < durationTicks - 10) {
      for (let i = 0; i < 4 && t < durationTicks - 10; i++) {
        notes.push({ hit: Math.round(t), lane, grade: null });
        lane = (lane + 1 + randInt(rng, P.LANES - 1)) % P.LANES;
        t += Math.max(P.MIN_GAP, beat * 2);
      }
      t += beat * (1 + randInt(rng, 2));
    }
    return {
      durationTicks,
      tick: 0,
      fallTicks: easy ? Math.round(P.FALL_TICKS * 1.5) : P.FALL_TICKS,
      perfect: easy ? P.PERFECT * 3 : P.PERFECT,
      good: easy ? P.GOOD * 3 : P.GOOD,
      bpm,
      notes,
      score: 0,
      combo: 0,
      maxCombo: 0,
      last: null,
    };
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'tap' && Number.isInteger(r.lane) && (r.lane as number) >= 0 && (r.lane as number) < P.LANES) {
      return { kind: 'tap', lane: r.lane as number };
    }
    return null;
  },
  input(s, { lane }) {
    let best: PulseNote | null = null;
    for (const n of s.notes) {
      if (n.grade || n.lane !== lane) continue;
      const d = Math.abs(n.hit - s.tick);
      if (d <= s.good && (!best || d < Math.abs(best.hit - s.tick))) best = n;
    }
    if (!best) {
      // Pulsación al aire: rompe la racha, no resta.
      s.combo = 0;
      return;
    }
    best.grade = Math.abs(best.hit - s.tick) <= s.perfect ? 'perfect' : 'good';
    s.score += best.grade === 'perfect' ? 2 : 1;
    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.last = { tick: s.tick, lane, grade: best.grade };
  },
  step(s) {
    for (const n of s.notes) {
      if (!n.grade && s.tick > n.hit + s.good) {
        n.grade = 'miss';
        s.combo = 0;
        s.last = { tick: s.tick, lane: n.lane, grade: 'miss' };
      }
    }
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
