/**
 * Variación programática de los sonidos genéricos: un único set de «criatura» suena distinto según
 * la etapa, la especie, el elemento, la rareza y el humor del Pockai, y un poco distinto cada vez.
 *
 * Todo es puro y determinista con el `rand` que se le pase: el motor aplica el resultado con nodos
 * de WebAudio (playbackRate, detune, filtros, saturación, trémolo, vibrato y reverb).
 */
import type { PitchProfile } from './manifest';

export type Element = 'fire' | 'water' | 'plant' | 'electric' | 'shadow' | 'light';
export type Rarity = 'normal' | 'rare' | 'super_rare' | 'legendary' | 'mythic';
export type VoiceStage = 'egg' | 'baby' | 'juvenile' | 'adult' | 'final';
export type VoiceMood = 'happy' | 'neutral' | 'sad' | 'sick' | 'sleepy';

/** Lo que se sabe del Pockai que hace el sonido. Todo opcional. */
export interface VoiceTraits {
  species?: string;
  stage?: VoiceStage;
  element?: Element;
  rarity?: Rarity;
  shiny?: boolean;
  mood?: VoiceMood;
}

export type FxSpec =
  | { kind: 'biquad'; type: 'lowpass' | 'highpass' | 'bandpass' | 'highshelf' | 'lowshelf' | 'peaking'; freq: number; q?: number; gain?: number }
  | { kind: 'drive'; amount: number }
  | { kind: 'tremolo'; rate: number; depth: number }
  | { kind: 'vibrato'; rate: number; cents: number };

export interface VoiceParams {
  /** playbackRate final (ya limitado a 0.5–2 junto con el detune). */
  rate: number;
  /** Desafinado en cents sobre el rate. */
  detune: number;
  /** Ajuste de volumen en dB. */
  gainDb: number;
  /** Cadena de efectos en orden. */
  fx: FxSpec[];
  /** Envío a reverb, 0–1. */
  reverb: number;
}

export const STAGE_RATE: Record<VoiceStage, number> = { egg: 1.4, baby: 1.3, juvenile: 1.12, adult: 1, final: 0.85 };

const RARITY_REVERB: Record<Rarity, number> = { normal: 0, rare: 0.05, super_rare: 0.1, legendary: 0.22, mythic: 0.32 };

const MOOD: Record<VoiceMood, { cents: number; rate: number }> = {
  happy: { cents: 100, rate: 1.03 },
  neutral: { cents: 0, rate: 1 },
  sad: { cents: -100, rate: 0.94 },
  sick: { cents: -150, rate: 0.9 },
  sleepy: { cents: -80, rate: 0.9 },
};

/** Filtros por elemento. `cents` y `reverb` se suman al resto. */
export const ELEMENT_COLOR: Record<Element, { fx: FxSpec[]; cents?: number; reverb?: number }> = {
  fire: { fx: [{ kind: 'drive', amount: 0.25 }, { kind: 'biquad', type: 'peaking', freq: 2000, q: 0.8, gain: 2 }] },
  water: { fx: [{ kind: 'biquad', type: 'lowpass', freq: 3000, q: 0.7 }, { kind: 'vibrato', rate: 5, cents: 15 }] },
  plant: { fx: [{ kind: 'biquad', type: 'peaking', freq: 800, q: 0.9, gain: 3 }, { kind: 'biquad', type: 'highshelf', freq: 6000, gain: -3 }] },
  electric: { fx: [{ kind: 'biquad', type: 'highpass', freq: 200, q: 0.7 }, { kind: 'tremolo', rate: 28, depth: 0.25 }] },
  shadow: { fx: [{ kind: 'biquad', type: 'lowpass', freq: 2500, q: 0.7 }], cents: -200, reverb: 0.15 },
  light: { fx: [{ kind: 'biquad', type: 'highshelf', freq: 5000, gain: 4 }], reverb: 0.1 },
};

/** Hash FNV-1a de 32 bits: el mismo id da siempre el mismo número. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Desafinado fijo de una especie: entre −300 y +300 cents en pasos de 50. */
export function speciesDetune(species: string | undefined): number {
  if (!species) return 0;
  return ((hashString(species) % 13) - 6) * 50;
}

const spread = (rand: () => number, amount: number) => (rand() * 2 - 1) * amount;

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

/** Pasa el detune a rate y limita el total a 0.5–2 (lo que admiten también SoundPool y AVAudio). */
function clampVoice(rate: number, detune: number): { rate: number; detune: number } {
  const total = rate * Math.pow(2, detune / 1200);
  const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, total));
  return { rate: clamped, detune: 0 };
}

export function computeVoice(profile: PitchProfile, traits: VoiceTraits = {}, rand: () => number = Math.random): VoiceParams {
  const out: VoiceParams = { rate: 1, detune: 0, gainDb: 0, fx: [], reverb: 0 };
  switch (profile) {
    case 'none':
      return out;
    case 'subtle':
      out.detune = spread(rand, 10);
      break;
    case 'footstep': {
      // Pasos: la etapa pesa la mitad (un final no camina como un elefante) y mucha variación.
      const stageRate = STAGE_RATE[traits.stage ?? 'adult'];
      out.rate = 1 + (stageRate - 1) * 0.5;
      out.detune = spread(rand, 120);
      out.gainDb = spread(rand, 3);
      break;
    }
    case 'element': {
      const color = traits.element ? ELEMENT_COLOR[traits.element] : undefined;
      if (color) {
        out.fx = [...color.fx];
        out.detune = color.cents ?? 0;
        out.reverb = color.reverb ?? 0;
      }
      out.detune += spread(rand, 30);
      break;
    }
    case 'creature':
    case 'creature-voice': {
      const mood = MOOD[traits.mood ?? 'neutral'];
      const color = traits.element ? ELEMENT_COLOR[traits.element] : undefined;
      out.rate = STAGE_RATE[traits.stage ?? 'adult'] * mood.rate;
      out.detune = speciesDetune(traits.species) + mood.cents + (color?.cents ?? 0);
      out.detune += spread(rand, profile === 'creature-voice' ? 80 : 40);
      out.gainDb = spread(rand, 1.5);
      out.fx = color ? [...color.fx] : [];
      out.reverb = (color?.reverb ?? 0) + RARITY_REVERB[traits.rarity ?? 'normal'] + (traits.shiny ? 0.08 : 0);
      if (traits.shiny) out.fx.push({ kind: 'biquad', type: 'highshelf', freq: 7000, gain: 2 });
      break;
    }
  }
  const v = clampVoice(out.rate, out.detune);
  out.rate = v.rate;
  out.detune = v.detune;
  out.reverb = Math.min(0.6, Math.max(0, out.reverb));
  return out;
}
