/**
 * Reglas puras de rareza (sin BD, sin reloj y con el azar inyectado).
 *
 * La rareza es de la **especie**: todos los ejemplares de una especie tienen la misma, y la tirada de
 * eclosión decide qué especie sale. Lo que varía de un ejemplar a otro es el **patrón**, que tiene
 * su propia rareza y su propia tirada.
 */
export const RARITY_ORDER = ['normal', 'rare', 'super_rare', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITY_ORDER)[number];

const rank = (r: string) => RARITY_ORDER.indexOf(r as Rarity);

/**
 * Rareza que se entrega de verdad cuando se ha tirado `rolled` y solo existen las rarezas de
 * `available`: la tirada si existe; si no, la más alta por debajo; si tampoco, la más baja por encima.
 * Así una tirada legendaria sin especies legendarias baja de rareza en vez de etiquetar como
 * legendario a un ejemplar de otra especie.
 */
export function resolveRarity(rolled: string, available: Iterable<string>): string {
  const have = new Set(available);
  if (have.has(rolled)) return rolled;
  const at = rank(rolled);
  for (let i = at - 1; i >= 0; i--) if (have.has(RARITY_ORDER[i])) return RARITY_ORDER[i];
  for (let i = Math.max(at + 1, 0); i < RARITY_ORDER.length; i++) if (have.has(RARITY_ORDER[i])) return RARITY_ORDER[i];
  return rolled;
}

/** Tirada de rareza por pesos (`balance.rarity`). `r` es un número en [0, 1). */
export function rollByWeights(weights: Record<string, { probability: number }>, r: number): string {
  let acc = 0;
  for (const rarity of RARITY_ORDER) {
    acc += weights[rarity]?.probability ?? 0;
    if (r < acc) return rarity;
  }
  return RARITY_ORDER[0];
}

export interface PatternDef {
  id: string;
  rarity: string;
}

/**
 * Patrón de un ejemplar: se tira su rareza con los mismos pesos que la de especie y se elige al azar
 * entre los patrones de esa rareza (o de la más cercana que tenga alguno).
 * `r` es un número en [0, 1) y `pick(n)` un entero en [0, n).
 */
export function pickPattern<T extends PatternDef>(
  patterns: T[],
  weights: Record<string, { probability: number }>,
  r: number,
  pick: (n: number) => number,
): T {
  const rarity = resolveRarity(rollByWeights(weights, r), patterns.map((p) => p.rarity));
  const pool = patterns.filter((p) => p.rarity === rarity);
  const from = pool.length ? pool : patterns;
  return from[pick(from.length)];
}
