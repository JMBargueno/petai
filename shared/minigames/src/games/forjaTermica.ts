import { createRng } from '../core/rng';
import { secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Forja Térmica (Fuego): un solo botón. Avivar el fuelle sube la temperatura y la forja se enfría
 * sola. Cada 3 s dentro de la zona justa (que se mueve) se templa una pieza (+4). Pasarse de 96°
 * quema la pieza en curso.
 *
 * Techo: una pieza cada 180 ticks como mucho → 4 / 3 s = 1,34 pt/s < 1,5.
 * Variante accesible: zona justa el doble de ancha y enfriamiento a la mitad.
 */
export const FORJA = {
  START: 40,
  COOL: 0.3,
  PUMP: 9,
  ZONE: 18,
  BURN: 96,
  AFTER_BURN: 65,
  TEMPER_TICKS: secondsToTicks(3),
  POINTS: 4,
  ZONE_RETARGET: secondsToTicks(3),
  ZONE_SPEED: 0.1,
} as const;

export interface ForjaState {
  rng: () => number;
  durationTicks: number;
  tick: number;
  temp: number;
  cool: number;
  zoneWidth: number;
  zone: number;
  zoneTarget: number;
  heat: number;
  pieces: number;
  burns: number;
  score: number;
  last: { tick: number; kind: 'piece' | 'burn' } | null;
}

export type ForjaInput = { kind: 'pump' };

const F = FORJA;

export const inZone = (s: ForjaState) => Math.abs(s.temp - s.zone) <= s.zoneWidth / 2;

export const forjaTermica: GameDefinition<ForjaState, ForjaInput> = {
  id: 'forja_termica',
  inputKeys: { pump: [] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const rng = createRng(seed);
    const easy = variant === 'easy';
    const zone = 45 + rng() * 20;
    return {
      rng,
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      temp: F.START,
      cool: easy ? F.COOL / 2 : F.COOL,
      zoneWidth: easy ? F.ZONE * 2 : F.ZONE,
      zone,
      zoneTarget: zone,
      heat: 0,
      pieces: 0,
      burns: 0,
      score: 0,
      last: null,
    };
  },
  parseInput(raw) {
    return raw && typeof raw === 'object' && (raw as { kind?: unknown }).kind === 'pump' ? { kind: 'pump' } : null;
  },
  input(s) {
    s.temp = Math.min(100, s.temp + F.PUMP);
  },
  step(s) {
    if (s.tick > 0 && s.tick % F.ZONE_RETARGET === 0) s.zoneTarget = 35 + s.rng() * 40;
    s.zone += Math.max(-F.ZONE_SPEED, Math.min(F.ZONE_SPEED, s.zoneTarget - s.zone));
    s.temp = Math.max(0, s.temp - s.cool);

    if (s.temp > F.BURN) {
      s.heat = 0;
      s.temp = F.AFTER_BURN;
      s.burns += 1;
      s.last = { tick: s.tick, kind: 'burn' };
    } else if (inZone(s)) {
      s.heat += 1;
      if (s.heat >= F.TEMPER_TICKS) {
        s.heat = 0;
        s.pieces += 1;
        s.score += F.POINTS;
        s.last = { tick: s.tick, kind: 'piece' };
      }
    }
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
