/**
 * Estado de ánimo de corto plazo.
 *
 * La personalidad cambia en semanas y los vitales (hambre, energía) dicen cómo está el cuerpo.
 * Entre medias falta lo que le acaba de pasar: un regaño le deja dolido un rato, una visita le
 * deja contento, un combate le deja alterado. Eso es este estado: dos números que los
 * acontecimientos empujan y que vuelven solos a su punto de reposo.
 *
 * - `valence` (-1..1): de dolido a contento.
 * - `arousal` (0..1): de adormilado a alterado.
 *
 * El punto de reposo depende de cómo es (un temperamento alto reposa más activo) y de cómo está
 * (con hambre o triste reposa más bajo). Funciones puras: el reloj llega de fuera.
 */
import type { Dims } from './dims';

export interface Feeling {
  valence: number;
  arousal: number;
  /** Momento (ms) al que corresponden los valores. */
  at: number;
}

export interface FeelingPush {
  valence?: number;
  arousal?: number;
}

export interface FeelingConfig {
  /** Minutos en los que la distancia al reposo se reduce a la mitad. */
  halfLifeMinutes: number;
  /** Cuánto empuja cada acontecimiento. */
  events: Readonly<Record<string, FeelingPush>>;
  /** Umbrales de las etiquetas. */
  labels: { high: number; low: number; excited: number; sleepy: number };
}

/** Lo que hace falta saber de la criatura para calcular su punto de reposo. */
export interface FeelingBody {
  happiness: number;
  energy: number;
  hunger: number;
  sick?: boolean;
}

export const FEELINGS = ['excited', 'content', 'upset', 'down', 'restless', 'sleepy', 'neutral'] as const;
export type FeelingLabel = (typeof FEELINGS)[number];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Punto de reposo: adonde vuelve el ánimo cuando no pasa nada. */
export function restingFeeling(dims: Dims, body: FeelingBody): { valence: number; arousal: number } {
  // La felicidad marca el fondo; el hambre y la enfermedad lo bajan
  let valence = (clamp(body.happiness, 0, 100) - 50) / 100;
  if (body.hunger < 30) valence -= 0.15;
  if (body.sick) valence -= 0.25;
  // Un temperamento alto reposa más activo; sin energía, cualquiera reposa bajo
  let arousal = 0.3 + (clamp(dims.temper, 0, 100) - 50) / 250;
  if (body.energy < 25) arousal -= 0.2;
  return { valence: round(clamp(valence, -1, 1)), arousal: round(clamp(arousal, 0, 1)) };
}

/** Ánimo de una criatura de la que aún no se sabe nada: su punto de reposo. */
export function initialFeeling(dims: Dims, body: FeelingBody, now: number): Feeling {
  return { ...restingFeeling(dims, body), at: now };
}

export function isFeeling(v: unknown): v is Feeling {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return [f.valence, f.arousal, f.at].every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** El ánimo tal como está ahora: lo guardado, acercado al reposo según el tiempo pasado. */
export function settleFeeling(feeling: Feeling, now: number, rest: { valence: number; arousal: number }, cfg: FeelingConfig): Feeling {
  const minutes = Math.max(0, (now - feeling.at) / 60_000);
  const keep = cfg.halfLifeMinutes > 0 ? Math.pow(0.5, minutes / cfg.halfLifeMinutes) : 0;
  return {
    valence: round(clamp(rest.valence + (feeling.valence - rest.valence) * keep, -1, 1)),
    arousal: round(clamp(rest.arousal + (feeling.arousal - rest.arousal) * keep, 0, 1)),
    at: now,
  };
}

/**
 * Aplica lo que acaba de pasar. Primero deja que el ánimo se asiente hasta `now` y después lo
 * empuja. La personalidad matiza: a quien es poco valiente lo malo le afecta más, y a quien es
 * muy afectuoso lo bueno le llega más.
 */
export function pushFeeling(
  feeling: Feeling | null | undefined,
  events: readonly string[],
  now: number,
  dims: Dims,
  body: FeelingBody,
  cfg: FeelingConfig,
): Feeling {
  const rest = restingFeeling(dims, body);
  let f = feeling && isFeeling(feeling) ? settleFeeling(feeling, now, rest, cfg) : { ...rest, at: now };
  for (const event of events) {
    const push = cfg.events[event];
    if (!push) continue;
    let dv = push.valence ?? 0;
    if (dv < 0) dv *= 1 + (50 - clamp(dims.bravery, 0, 100)) / 200;
    else if (dv > 0) dv *= 1 + (clamp(dims.affection, 0, 100) - 50) / 200;
    f = {
      valence: round(clamp(f.valence + dv, -1, 1)),
      arousal: round(clamp(f.arousal + (push.arousal ?? 0), 0, 1)),
      at: now,
    };
  }
  return f;
}

/** El ánimo en una palabra, para elegir frases, tono y conductas. */
export function feelingLabel(feeling: Pick<Feeling, 'valence' | 'arousal'>, cfg: Pick<FeelingConfig, 'labels'>): FeelingLabel {
  const { high, low, excited, sleepy } = cfg.labels;
  if (feeling.valence >= high) return feeling.arousal >= excited ? 'excited' : 'content';
  if (feeling.valence <= low) return feeling.arousal >= excited ? 'upset' : 'down';
  if (feeling.arousal >= excited) return 'restless';
  if (feeling.arousal <= sleepy) return 'sleepy';
  return 'neutral';
}
