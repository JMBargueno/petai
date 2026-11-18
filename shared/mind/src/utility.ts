/**
 * Selector por utilidad: elige una conducta entre varias candidatas según la personalidad, el
 * contexto y lo que la criatura ha hecho hace poco. Lo usan el escritorio y la sala del hábitat.
 *
 * Es una función pura: el reloj (`now`) y el azar (`rng`) llegan de fuera, así que la misma
 * entrada da siempre la misma salida.
 */
import { type Dims, weighted } from './dims';
import type { Rng } from './rng';

export interface UtilityCandidate {
  id: string;
  /** Peso de partida con una personalidad neutra. */
  base: number;
  /** Cuánto mueve el peso cada punto de dimensión por encima o por debajo de 50. */
  weights?: Partial<Dims>;
  /** Multiplicador de contexto ya calculado (necesidades, app en foco…). 0 la descarta. */
  factor?: number;
  /** Tiempo mínimo entre dos apariciones. */
  cooldownMs?: number;
}

export interface UtilityConfig {
  /** Cuántas elecciones recientes cuentan para la penalización por repetición. */
  window: number;
  /** Factor (0-1) que multiplica la puntuación por cada aparición en la ventana. */
  penalty: number;
  /** Se muestrea entre las `top` mejores, en proporción a su puntuación. */
  top: number;
  /** Margen relativo que una candidata debe superar para desbancar a la conducta en curso. */
  margin: number;
}

export interface UtilityInput {
  candidates: readonly UtilityCandidate[];
  dims: Dims;
  /** Elecciones anteriores, la más reciente al final. */
  recent: readonly string[];
  /** Momento (ms) de la última vez que se eligió cada conducta. */
  lastAt: Readonly<Record<string, number>>;
  now: number;
  rng: Rng;
  cfg: UtilityConfig;
  /** Conducta en curso, si se quiere histéresis (la sala la usa; el escritorio no). */
  current?: string | null;
}

export interface Scored {
  id: string;
  score: number;
}

export const DEFAULT_UTILITY: UtilityConfig = { window: 6, penalty: 0.45, top: 3, margin: 0.15 };

export function onCooldown(c: UtilityCandidate, lastAt: Readonly<Record<string, number>>, now: number): boolean {
  if (!c.cooldownMs) return false;
  const last = lastAt[c.id];
  return last !== undefined && now - last < c.cooldownMs;
}

/** Puntuación de cada candidata admitida, de mayor a menor (a igualdad, el orden de entrada). */
export function scoreCandidates(input: Omit<UtilityInput, 'rng'>): Scored[] {
  const { candidates, dims, recent, lastAt, now, cfg } = input;
  const window = recent.slice(Math.max(0, recent.length - cfg.window));
  const last = recent.length > 0 ? recent[recent.length - 1] : null;
  const twiceInARow = recent.length > 1 && recent[recent.length - 2] === last;
  const scored: Scored[] = [];
  for (const c of candidates) {
    const factor = c.factor ?? 1;
    if (!(factor > 0) || !(c.base > 0)) continue;
    if (onCooldown(c, lastAt, now)) continue;
    // Nunca tres veces seguidas la misma, salvo que no haya otra cosa que hacer (ver abajo)
    if (twiceInARow && c.id === last) continue;
    const repeats = window.reduce((n, id) => (id === c.id ? n + 1 : n), 0);
    const score = weighted(c.base, c.weights, dims) * factor * Math.pow(cfg.penalty, repeats);
    if (score > 0) scored.push({ id: c.id, score });
  }
  if (scored.length === 0 && twiceInARow) {
    // Solo quedaba la repetida: mejor repetir que quedarse sin conducta
    const only = candidates.find((c) => c.id === last);
    if (only && (only.factor ?? 1) > 0 && only.base > 0 && !onCooldown(only, lastAt, now)) {
      scored.push({ id: only.id, score: weighted(only.base, only.weights, dims) * (only.factor ?? 1) });
    }
  }
  // Orden estable: a igual puntuación gana la primera declarada
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Elige una conducta. Devuelve `null` si ninguna candidata es admisible.
 *
 * 1. Puntúa (personalidad × contexto × penalización por repetición) y descarta las que están
 *    en enfriamiento.
 * 2. Si hay conducta en curso y ninguna la supera por el margen, la mantiene.
 * 3. Muestrea entre las mejores en proporción a su puntuación, con el generador recibido.
 */
export function selectByUtility(input: UtilityInput): string | null {
  const scored = scoreCandidates(input);
  if (scored.length === 0) return null;

  const { cfg, rng, current } = input;
  if (current) {
    const mine = scored.find((s) => s.id === current);
    if (mine && scored[0].score < mine.score * (1 + cfg.margin)) return current;
  }

  const pool = scored.slice(0, Math.max(1, cfg.top));
  const total = pool.reduce((sum, s) => sum + s.score, 0);
  let roll = rng() * total;
  for (const s of pool) {
    roll -= s.score;
    if (roll < 0) return s.id;
  }
  return pool[pool.length - 1].id;
}

/** Añade una elección al historial reciente, sin dejarlo crecer más de `max`. */
export function pushRecent(recent: readonly string[], id: string, max: number): string[] {
  const next = [...recent, id];
  return next.length > max ? next.slice(next.length - max) : next;
}
