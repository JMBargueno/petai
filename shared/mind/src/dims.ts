/**
 * Dimensiones de personalidad de un Pockai (spec 36): cinco valores 0-100. Estas funciones son
 * las mismas que `backend/src/modules/mind/personality.engine.ts`; un test del escritorio
 * compara ambas implementaciones hasta que el servidor adopte este paquete.
 */
import { createRng, hashSeed } from './rng';

export const DIMENSIONS = ['curiosity', 'sociability', 'bravery', 'affection', 'temper'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Dims = Record<Dimension, number>;

export interface Band {
  /** Límite superior inclusivo de la banda. */
  max: number;
  keyword: string;
  label: string;
}

export type BandTable = Record<Dimension, { bands: Band[] }>;

export const clampDim = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

export function neutralDims(value = 50): Dims {
  return { curiosity: value, sociability: value, bravery: value, affection: value, temper: value };
}

export function isValidDims(v: unknown): v is Dims {
  if (!v || typeof v !== 'object') return false;
  return DIMENSIONS.every((d) => {
    const n = (v as Record<string, unknown>)[d];
    return typeof n === 'number' && Number.isFinite(n);
  });
}

/** Valores al nacer: sesgo de especie ± variación, determinista por semilla (visualSeed). */
export function rollBirthDims(
  bias: Partial<Dims> | undefined,
  seed: number,
  birth: { variance: number; defaultBias: number },
): Dims {
  const rng = createRng(hashSeed(`dims:${seed}`));
  const out = {} as Dims;
  for (const d of DIMENSIONS) {
    const base = bias?.[d] ?? birth.defaultBias;
    out[d] = Math.round(clampDim(base + (rng() * 2 - 1) * birth.variance));
  }
  return out;
}

export function bandOf(dim: Dimension, value: number, table: BandTable): Band {
  const bands = table[dim].bands;
  return bands.find((b) => value <= b.max) ?? bands[bands.length - 1];
}

/** Peso de una actividad/acción según las dimensiones: base + Σ peso·(valor-50). */
export function weighted(base: number, weights: Partial<Dims> | undefined, dims: Dims, floor = 0.1): number {
  let w = base;
  if (weights) for (const d of DIMENSIONS) w += (weights[d] ?? 0) * (dims[d] - 50);
  return Math.max(floor, w);
}
