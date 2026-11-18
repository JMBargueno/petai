/**
 * Registro de assets de la escena. Vite los copia/inyecta como URLs, así el bundle embed funciona
 * offline desde los assets de la app (Android/iOS) y desde el servidor de Vite en escritorio.
 *
 * Hojas por etapa: adult = `species/<id>/` (alias histórico); baby/juvenile/final =
 * `species/<id>/<etapa>/`. Si falta una etapa se usa adult.
 */
import type { AnimMetadata } from './bake/anim';
import type { AccessoryMeta, AccessorySize, AnchorsFile } from './bake/accessories';
import type { Stage } from './protocol';

// Todas las hojas (adult en la raíz de la especie; baby/juvenile/final en subcarpetas). Vite las
// resuelve en build: añadir una especie o etapa solo requiere generar sus archivos.
const PNGS = import.meta.glob('../../assets/species/**/{base,mask}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ANIMS = import.meta.glob('../../assets/species/**/anim.json', { eager: true, import: 'default' }) as Record<string, AnimMetadata>;

// Anclas de accesorio por especie y etapa, y arte de las prendas en tres tallas (spec 38).
const ANCHORS = import.meta.glob('../../assets/species/**/anchors.json', { eager: true, import: 'default' }) as Record<string, AnchorsFile>;
const ACC_PNGS = import.meta.glob('../../assets/accessories/*/{s,m,l}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ACC_METAS = import.meta.glob('../../assets/accessories/*/meta.json', { eager: true, import: 'default' }) as Record<string, AccessoryMeta>;

import stripesPng from '../../assets/patterns/stripes.png';
import spotsPng from '../../assets/patterns/spots.png';
import scalesPng from '../../assets/patterns/scales.png';
import crystalPng from '../../assets/patterns/crystal.png';
import galaxyPng from '../../assets/patterns/galaxy.png';
import gradientPng from '../../assets/patterns/gradient.png';
import auroraPng from '../../assets/patterns/aurora.png';

export interface SheetAssets {
  base: string;
  mask: string;
  anim: AnimMetadata;
  /** Anclas de accesorio; `null` si la hoja no las tiene (huevo, placeholder). */
  anchors: AnchorsFile | null;
}

const STAGE_KEYS: (Stage | 'default')[] = ['baby', 'juvenile', 'final'];

function buildSheets(): Record<string, Partial<Record<Stage | 'default', SheetAssets>>> {
  const out: Record<string, Partial<Record<Stage | 'default', SheetAssets>>> = {};
  for (const [file, anim] of Object.entries(ANIMS)) {
    const m = file.match(/species\/([^/]+)\/(?:([^/]+)\/)?anim\.json$/);
    if (!m) continue;
    const [, id, sub] = m;
    const stage = (sub ?? 'default') as Stage | 'default';
    if (sub && !STAGE_KEYS.includes(stage)) continue;
    const dir = file.slice(0, -'anim.json'.length);
    const base = PNGS[`${dir}base.png`];
    const mask = PNGS[`${dir}mask.png`];
    if (!base || !mask) continue;
    (out[id] ??= {})[stage] = { base, mask, anim, anchors: ANCHORS[`${dir}anchors.json`] ?? null };
  }
  return out;
}

const SHEETS = buildSheets();

export const PATTERNS: Record<string, string> = {
  stripes: stripesPng,
  spots: spotsPng,
  scales: scalesPng,
  crystal: crystalPng,
  galaxy: galaxyPng,
  gradient: gradientPng,
  aurora: auroraPng,
};

export const FALLBACK_SPECIES = 'ignisaur';

/** Hoja de `(especie, etapa)` → etapa adult/alias → `ignisaur`. El huevo ignora la especie. */
export function resolveSheet(species: string, stage: Stage): { key: string; sheet: SheetAssets } {
  const id = stage === 'egg' ? 'egg' : SHEETS[species] ? species : FALLBACK_SPECIES;
  const entry = SHEETS[id];
  const sheet = entry[stage] ?? entry.default!;
  const key = entry[stage] ? `${id}/${stage}` : id;
  return { key, sheet };
}

const ACCESSORIES: Record<string, { meta: AccessoryMeta; urls: Record<string, string> }> = {};
for (const [file, meta] of Object.entries(ACC_METAS)) {
  const m = file.match(/accessories\/([^/]+)\/meta\.json$/);
  if (!m) continue;
  const dir = file.slice(0, -'meta.json'.length);
  ACCESSORIES[m[1]] = { meta, urls: { S: ACC_PNGS[`${dir}s.png`], M: ACC_PNGS[`${dir}m.png`], L: ACC_PNGS[`${dir}l.png`] } };
}

/** Hoja y medidas de una prenda en una talla; `null` si este cliente no tiene su arte. */
export function resolveAccessory(id: string, size: AccessorySize): { url: string; meta: AccessoryMeta } | null {
  const acc = ACCESSORIES[id];
  const url = acc?.urls[size];
  return acc && url ? { url, meta: acc.meta } : null;
}

export function isKnownSpecies(species: string): boolean {
  return species in SHEETS && species !== 'egg';
}
