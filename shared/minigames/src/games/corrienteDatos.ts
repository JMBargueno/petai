import { createRng } from '../core/rng';
import { randInt, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Corriente de Datos (Agua): el Pockai nada por 4 carriles; recoge paquetes (+1) y esquiva bloques
 * corruptos (aturdimiento de 1 s, se pierde la racha). Cada 15 s la corriente va más rápida.
 *
 * Techo: sale una fila cada 0,5 s con un único paquete → como mucho 2 pt/s.
 * Variante accesible: corriente a la mitad de velocidad y sin aturdimiento.
 */
export const CORRIENTE = {
  LANES: 4,
  ROW_TICKS: 30,
  FALL_TICKS: 120,
  MIN_FALL_TICKS: 60,
  SPEEDUP_EVERY: secondsToTicks(15),
  STUN_TICKS: 60,
  BLOCK_CHANCE: 0.55,
} as const;

export interface StreamObject {
  id: number;
  lane: number;
  kind: 'packet' | 'block';
  spawn: number;
  fall: number;
}

export interface CorrienteState {
  rng: () => number;
  durationTicks: number;
  tick: number;
  easy: boolean;
  lane: number;
  stunnedUntil: number;
  objects: StreamObject[];
  nextId: number;
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  last: { tick: number; kind: 'packet' | 'block' } | null;
}

export type CorrienteInput = { kind: 'shift'; d: number } | { kind: 'lane'; l: number };

const C = CORRIENTE;

export const fallTicksAt = (s: Pick<CorrienteState, 'tick' | 'easy'>) => {
  const base = Math.max(C.MIN_FALL_TICKS, Math.round(C.FALL_TICKS * 0.85 ** Math.floor(s.tick / C.SPEEDUP_EVERY)));
  return s.easy ? base * 2 : base;
};

export const corrienteDatos: GameDefinition<CorrienteState, CorrienteInput> = {
  id: 'corriente_datos',
  inputKeys: { shift: ['d'], lane: ['l'] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    return {
      rng: createRng(seed),
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      easy: variant === 'easy',
      lane: 1,
      stunnedUntil: -1,
      objects: [],
      nextId: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      hits: 0,
      last: null,
    };
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'shift' && (r.d === -1 || r.d === 1)) return { kind: 'shift', d: r.d };
    if (r.kind === 'lane' && Number.isInteger(r.l) && (r.l as number) >= 0 && (r.l as number) < C.LANES) return { kind: 'lane', l: r.l as number };
    return null;
  },
  input(s, inp) {
    if (s.tick < s.stunnedUntil) return;
    const target = inp.kind === 'shift' ? s.lane + inp.d : inp.l;
    s.lane = Math.min(C.LANES - 1, Math.max(0, target));
  },
  step(s) {
    if (s.tick % C.ROW_TICKS === 0 && s.tick + 1 < s.durationTicks) {
      const fall = fallTicksAt(s);
      const packet = randInt(s.rng, C.LANES);
      s.objects.push({ id: s.nextId++, lane: packet, kind: 'packet', spawn: s.tick, fall });
      if (s.rng() < C.BLOCK_CHANCE) {
        const block = (packet + 1 + randInt(s.rng, C.LANES - 1)) % C.LANES;
        s.objects.push({ id: s.nextId++, lane: block, kind: 'block', spawn: s.tick, fall });
      }
    }
    const remaining: StreamObject[] = [];
    for (const o of s.objects) {
      if (s.tick - o.spawn < o.fall) {
        remaining.push(o);
        continue;
      }
      if (o.lane !== s.lane) continue;
      if (o.kind === 'packet') {
        s.score += 1;
        s.combo += 1;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
      } else {
        s.hits += 1;
        s.combo = 0;
        if (!s.easy) s.stunnedUntil = s.tick + C.STUN_TICKS;
      }
      s.last = { tick: s.tick, kind: o.kind };
    }
    s.objects = remaining;
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
