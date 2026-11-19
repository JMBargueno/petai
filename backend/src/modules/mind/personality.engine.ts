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
import * as core from '@pockai/mind/node';
import { DIMENSIONS, Band, Dimension, DimView, Dims, PersonalityConfig, StoredPersonality } from './mind.types';

// El núcleo (acotar, nacer, bandas y pesos) es el de `@pockai/mind`, el mismo que usan el
// escritorio y la sala: una sola implementación. Aquí solo se adapta a la configuración del
// servidor (`PersonalityConfig`) y se añade lo que es solo suyo (prompt, combate, heredados).

/**
 * Acota a 0-100 y guarda con 3 decimales. Con un solo decimal los deltas de 0,05 de balance.json se
 * perdían o se duplicaban al redondear; quien presenta el valor lo redondea a entero.
 */
export const clampDim = core.clampDim;

export const neutralDims: (value?: number) => Dims = core.neutralDims;

/** Valores al nacer: sesgo de especie ± variación, determinista por semilla (visualSeed). */
export function rollBirthDims(bias: Partial<Dims> | undefined, seed: number, cfg: PersonalityConfig): Dims {
  return core.rollBirthDims(bias, seed, cfg.birth);
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

export const isValidDims: (v: unknown) => v is Dims = core.isValidDims;

export function bandOf(dim: Dimension, value: number, cfg: PersonalityConfig): Band {
  return core.bandOf(dim, value, cfg.dimensions as unknown as core.BandTable) as unknown as Band;
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
    // Rasgo con significado, en primera persona: «Sociabilidad 52 % — soy amistoso: …»
    return `- ${cfg.dimensions[d].label} ${Math.round(dims[d])} % — soy ${b.label.toLowerCase()}: ${b.self ?? b.prompt}`;
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
export const weighted: (base: number, weights: Partial<Dims> | undefined, dims: Dims, floor?: number) => number = core.weighted;
