/**
 * Registro de efectos del escritorio. Cada efecto nuevo se añade aquí (lo lee
 * `.claude/skills/pockai-effect-architect/scripts/check_effects.mjs` y la hoja de frames).
 */
import { portalNexo } from './portalNexo';
import { capulloTelar } from './capulloTelar';
import { resonancia } from './resonancia';
import { hebraInvocacion } from './hebraInvocacion';
import { revelacionDensidad } from './revelacionDensidad';
import { altarSantuario } from './altarSantuario';
import { descargaCalida } from './descargaCalida';
import type { EffectDef, FxPhase } from './types';

export const EFFECTS: Record<string, EffectDef> = {
  [portalNexo.id]: portalNexo,
  [capulloTelar.id]: capulloTelar,
  [resonancia.id]: resonancia,
  [hebraInvocacion.id]: hebraInvocacion,
  [revelacionDensidad.id]: revelacionDensidad,
  [altarSantuario.id]: altarSantuario,
  [descargaCalida.id]: descargaCalida,
};

/** Fases que tocan para estos datos (algunos efectos se saltan fases según el momento). */
export function phasesOf(def: EffectDef, params: Record<string, string | number>, reduced: boolean): FxPhase[] {
  return def.phasesFor?.(params, reduced) ?? (reduced ? def.reducedPhases : def.phases);
}

export { portalNexo, capulloTelar, resonancia, hebraInvocacion, revelacionDensidad, altarSantuario, descargaCalida };
export { EffectPlayer, fixedDuration, quantize } from './timeline';
export { flowPalette, FLOW_PALETTES, FLOW_NAMES } from './palettes';
export { renderFrame, GridSink } from './render';
export { speciesElement } from './speciesElement';
export type { EffectDef, FxFrame, FxPalette, FxPhase, PixelSink } from './types';
