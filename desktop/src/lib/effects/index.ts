/**
 * Registro de efectos del escritorio. Cada efecto nuevo se añade aquí (lo lee
 * `.claude/skills/pockai-effect-architect/scripts/check_effects.mjs` y la hoja de frames).
 */
import { portalNexo } from './portalNexo';
import { capulloTelar } from './capulloTelar';
import { resonancia } from './resonancia';
import { hebraInvocacion } from './hebraInvocacion';
import type { EffectDef } from './types';

export const EFFECTS: Record<string, EffectDef> = {
  [portalNexo.id]: portalNexo,
  [capulloTelar.id]: capulloTelar,
  [resonancia.id]: resonancia,
  [hebraInvocacion.id]: hebraInvocacion,
};

export { portalNexo, capulloTelar, resonancia, hebraInvocacion };
export { EffectPlayer, fixedDuration, quantize } from './timeline';
export { flowPalette, FLOW_PALETTES, FLOW_NAMES } from './palettes';
export { renderFrame, GridSink } from './render';
export { speciesElement } from './speciesElement';
export type { EffectDef, FxFrame, FxPalette, FxPhase, PixelSink } from './types';
