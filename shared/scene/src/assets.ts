/**
 * Registro de assets de la escena. Vite los copia/inyecta como URLs, así el bundle embed funciona
 * offline desde los assets de la app (Android/iOS) y desde el servidor de Vite en escritorio.
 *
 * Hojas por etapa: cuando existan `species/<id>/<stage>/…` (fase 3) se registran aquí; mientras,
 * todas las etapas usan la hoja alias (adult).
 */
import type { AnimMetadata } from './bake/anim';
import type { Stage } from './protocol';

import ignisaurBase from '../../assets/species/ignisaur/base.png';
import ignisaurMask from '../../assets/species/ignisaur/mask.png';
import ignisaurAnim from '../../assets/species/ignisaur/anim.json';
import axolunarBase from '../../assets/species/axolunar/base.png';
import axolunarMask from '../../assets/species/axolunar/mask.png';
import axolunarAnim from '../../assets/species/axolunar/anim.json';
import florabudBase from '../../assets/species/florabud/base.png';
import florabudMask from '../../assets/species/florabud/mask.png';
import florabudAnim from '../../assets/species/florabud/anim.json';
import eggBase from '../../assets/species/egg/base.png';
import eggMask from '../../assets/species/egg/mask.png';
import eggAnim from '../../assets/species/egg/anim.json';

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

const SHEETS: Record<string, Partial<Record<Stage | 'default', SheetAssets>>> = {
  ignisaur: { default: { base: ignisaurBase, mask: ignisaurMask, anim: ignisaurAnim as AnimMetadata } },
  axolunar: { default: { base: axolunarBase, mask: axolunarMask, anim: axolunarAnim as AnimMetadata } },
  florabud: { default: { base: florabudBase, mask: florabudMask, anim: florabudAnim as AnimMetadata } },
  egg: { default: { base: eggBase, mask: eggMask, anim: eggAnim as AnimMetadata } },
};

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
  const sheet = entry[stage] ?? entry.adult ?? entry.default!;
  const key = entry[stage] ? `${id}/${stage}` : id;
  return { key, sheet };
}

export function isKnownSpecies(species: string): boolean {
  return species in SHEETS && species !== 'egg';
}
