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
import { selloLogro } from './selloLogro';
import { proyeccionAstral } from './proyeccionAstral';
import { trenzaJuramento } from './trenzaJuramento';
import { chispaDespertar } from './chispaDespertar';
import { paqueteHebra } from './paqueteHebra';
import { manitasEspirituales } from './manitasEspirituales';
import { glitchAnimo } from './glitchAnimo';
import { polvoEstatico } from './polvoEstatico';
import { desfragmentacion } from './desfragmentacion';
import { polvoImpacto } from './polvoImpacto';
import { estelaFlujo } from './estelaFlujo';
import { destelloPrisma } from './destelloPrisma';
import { clima } from './clima';
import type { EffectDef, FxPhase } from './types';

export const EFFECTS: Record<string, EffectDef> = {
  [portalNexo.id]: portalNexo,
  [capulloTelar.id]: capulloTelar,
  [resonancia.id]: resonancia,
  [hebraInvocacion.id]: hebraInvocacion,
  [revelacionDensidad.id]: revelacionDensidad,
  [altarSantuario.id]: altarSantuario,
  [descargaCalida.id]: descargaCalida,
  [selloLogro.id]: selloLogro,
  [proyeccionAstral.id]: proyeccionAstral,
  [trenzaJuramento.id]: trenzaJuramento,
  [chispaDespertar.id]: chispaDespertar,
  [paqueteHebra.id]: paqueteHebra,
  [manitasEspirituales.id]: manitasEspirituales,
  [glitchAnimo.id]: glitchAnimo,
  [polvoEstatico.id]: polvoEstatico,
  [desfragmentacion.id]: desfragmentacion,
  [polvoImpacto.id]: polvoImpacto,
  [estelaFlujo.id]: estelaFlujo,
  [destelloPrisma.id]: destelloPrisma,
  [clima.id]: clima,
};

/** Fases que tocan para estos datos (algunos efectos se saltan fases según el momento). */
export function phasesOf(def: EffectDef, params: Record<string, string | number>, reduced: boolean): FxPhase[] {
  return def.phasesFor?.(params, reduced) ?? (reduced ? def.reducedPhases : def.phases);
}

export {
  portalNexo,
  capulloTelar,
  resonancia,
  hebraInvocacion,
  revelacionDensidad,
  altarSantuario,
  descargaCalida,
  selloLogro,
  proyeccionAstral,
  trenzaJuramento,
  chispaDespertar,
  paqueteHebra,
  manitasEspirituales,
  glitchAnimo,
  polvoEstatico,
  desfragmentacion,
  polvoImpacto,
  estelaFlujo,
  destelloPrisma,
  clima,
};
export { prismColors } from './destelloPrisma';
export { EffectPlayer, fixedDuration, quantize } from './timeline';
export { flowPalette, FLOW_PALETTES, FLOW_NAMES } from './palettes';
export { renderFrame, GridSink, CanvasSink } from './render';
export { admitMoment } from './momentQueue';
export { hash, invert } from './fxMath';
export { speciesElement } from './speciesElement';
export { effectForPetAction, birthParams, ACTIONS_WITH_EFFECT, type EffectRequest } from './reactions';
export type { EffectDef, FxFrame, FxPalette, FxPhase, PixelSink } from './types';
