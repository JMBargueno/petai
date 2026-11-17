/**
 * Personality Engine (spec 36) — funciones puras.
 *
 * Cinco dimensiones 0-100 (curiosidad, sociabilidad, valentía, afectividad, temperamento). Cada
 * rango tiene una keyword (balance.personality.dimensions[dim].bands). Las dimensiones nacen del
 * sesgo de la especie más una variación determinista y luego las mueve el Evolution Engine.
 *
 * Este motor responde "cómo es esta criatura": describe el perfil, lo traduce a prompt, sesga la
 * IA de combate y deriva los campos heredados (trait de notificaciones y temperament de genes).
 */
import { createRng, hashSeed } from '../battles/combat/rng';
import { DIMENSIONS, Band, Dimension, DimView, Dims, PersonalityConfig, StoredPersonality } from './mind.types';

export const clampDim = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

export function neutralDims(value = 50): Dims {
  return { curiosity: value, sociability: value, bravery: value, affection: value, temper: value };
}

/** Valores al nacer: sesgo de especie ± variación, determinista por semilla (visualSeed). */
export function rollBirthDims(bias: Partial<Dims> | undefined, seed: number, cfg: PersonalityConfig): Dims {
  const rng = createRng(hashSeed(`dims:${seed}`));
  const out = {} as Dims;
  for (const d of DIMENSIONS) {
    const base = bias?.[d] ?? cfg.birth.defaultBias;
    out[d] = Math.round(clampDim(base + (rng() * 2 - 1) * cfg.birth.variance));
  }
  return out;
}

/**
 * Mascotas anteriores a la spec 36: se respeta el carácter que ya tenían. El rasgo fijo del chat
 * (traitOf(visualSeed)) y el temperamento de genes empujan el valor de nacimiento.
 */
const LEGACY_CHAT_TRAIT: Record<string, Partial<Dims>> = {
  curious: { curiosity: 15 },
  mischievous: { temper: 15, sociability: 5 },
  shy: { bravery: -15, sociability: -10 },
  proud: { bravery: 10, temper: 5 },
  affectionate: { affection: 15 },
  philosopher: { temper: -15, curiosity: 5 },
};
const LEGACY_TEMPERAMENT: Record<string, Partial<Dims>> = {
  valiente: { bravery: 10 },
  timido: { bravery: -10 },
  arribista: { temper: 10 },
  curioso: { curiosity: 10 },
};

export function legacyDims(base: Dims, chatTraitId: string | undefined, temperament: string | undefined): Dims {
  const out = { ...base };
  for (const nudge of [LEGACY_CHAT_TRAIT[chatTraitId ?? ''], LEGACY_TEMPERAMENT[temperament ?? '']]) {
    if (!nudge) continue;
    for (const d of DIMENSIONS) out[d] = Math.round(clampDim(out[d] + (nudge[d] ?? 0)));
  }
  return out;
}

export function isValidDims(v: unknown): v is Dims {
  if (!v || typeof v !== 'object') return false;
  return DIMENSIONS.every((d) => typeof (v as any)[d] === 'number' && Number.isFinite((v as any)[d]));
}

export function bandOf(dim: Dimension, value: number, cfg: PersonalityConfig): Band {
  const bands = cfg.dimensions[dim].bands;
  return bands.find((b) => value <= b.max) ?? bands[bands.length - 1];
}

export function describeDims(dims: Dims, cfg: PersonalityConfig): Record<Dimension, DimView> {
  const out = {} as Record<Dimension, DimView>;
  for (const d of DIMENSIONS) {
    const b = bandOf(d, dims[d], cfg);
    out[d] = { value: Math.round(dims[d]), keyword: b.keyword, label: b.label };
  }
  return out;
}

/**
 * Campos heredados derivados de las dimensiones:
 * - `trait`: clave de las plantillas de notificaciones (valiente | timido | travieso | dulce | curioso | neutral).
 * - `temperament`: temperamento de genes/aventura (valiente | timido | arribista | curioso).
 */
export function deriveLegacy(dims: Dims): { trait: string; temperament: string } {
  const pick = (cands: [string, number][], fallback: string, min: number) => {
    const best = cands.reduce((a, b) => (b[1] > a[1] ? b : a));
    return best[1] >= min ? best[0] : fallback;
  };
  const trait = pick(
    [
      ['valiente', dims.bravery - 50],
      ['timido', 50 - dims.bravery],
      ['travieso', dims.temper - 50],
      ['dulce', dims.affection - 50],
      ['curioso', dims.curiosity - 50],
    ],
    'neutral',
    10,
  );
  const temperament = pick(
    [
      ['valiente', dims.bravery - 50],
      ['timido', 50 - dims.bravery],
      ['arribista', (dims.temper - 50 + (dims.bravery - 50)) / 2],
      ['curioso', dims.curiosity - 50],
    ],
    'curioso',
    5,
  );
  return { trait, temperament };
}

/** Personalidad lista para guardar: conserva claves ajenas (genes…) y refresca las derivadas. */
export function withDims(stored: StoredPersonality | null | undefined, dims: Dims): StoredPersonality {
  return { ...(stored ?? {}), dims, ...deriveLegacy(dims) };
}

/** Bloque de personalidad para el prompt de sistema del chat. */
export function buildPersonalityBlock(dims: Dims, cfg: PersonalityConfig): string {
  const lines = DIMENSIONS.map((d) => {
    const b = bandOf(d, dims[d], cfg);
    return `- ${cfg.dimensions[d].label} ${Math.round(dims[d])}/100 (${b.label}): ${b.prompt}`;
  });
  return [
    'Tu personalidad (ha ido cambiando con lo que has vivido; compórtate según ella, sin citar los números):',
    ...lines,
  ].join('\n');
}

/**
 * Sesgo de la IA de combate: desplaza los umbrales de curar/protegerse sin tocar stats ni el
 * azar del combate (Constitución II). Valentía alta → cura y se protege más tarde; temperamento
 * alto → se protege menos. Acotado a ±maxThresholdShift.
 */
export function combatBias(dims: Dims | undefined, cfg: PersonalityConfig): { heal: number; guard: number } | undefined {
  if (!dims) return undefined;
  const max = cfg.combat.maxThresholdShift;
  const clamp = (v: number) => Math.round(Math.max(-max, Math.min(max, v)) * 1000) / 1000 + 0; // +0 evita -0
  const brave = (dims.bravery - 50) / 50;
  const temper = (dims.temper - 50) / 50;
  return { heal: clamp(-brave * max), guard: clamp(-brave * max * 0.6 - temper * max * 0.4) };
}

/** Peso de una actividad/acción según las dimensiones: base + Σ peso·(valor-50). */
export function weighted(base: number, weights: Partial<Dims>, dims: Dims, floor = 0.1): number {
  let w = base;
  for (const d of DIMENSIONS) w += (weights[d] ?? 0) * (dims[d] - 50);
  return Math.max(floor, w);
}
