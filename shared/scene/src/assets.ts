/**
 * Registro de assets de la escena. Vite los copia/inyecta como URLs, así el bundle embed funciona
 * offline desde los assets de la app (Android/iOS) y desde el servidor de Vite en escritorio.
 *
 * Hojas por etapa: adult = `species/<id>/` (alias histórico); baby/juvenile/final =
 * `species/<id>/<etapa>/`. Si falta una etapa se usa adult.
 */
import type { AnimMetadata } from './bake/anim';
import type { Stage } from './protocol';

// Todas las hojas (adult en la raíz de la especie; baby/juvenile/final en subcarpetas). Vite las
// resuelve en build: añadir una especie o etapa solo requiere generar sus archivos.
const PNGS = import.meta.glob('../../assets/species/**/{base,mask}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ANIMS = import.meta.glob('../../assets/species/**/anim.json', { eager: true, import: 'default' }) as Record<string, AnimMetadata>;

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
    (out[id] ??= {})[stage] = { base, mask, anim };
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

export function isKnownSpecies(species: string): boolean {
  return species in SHEETS && species !== 'egg';
}
