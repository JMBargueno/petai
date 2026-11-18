import type { FxPalette } from './types';

/**
 * Rampas de los Seis Flujos del Éter (LORE §4). El tono medio es el color de UI del elemento
 * (GUIA_ARTISTICA §3.6, `--elem-*`); para Eléctrico, Sombra y Luz se usa la propuesta de la guía
 * (sunburst, voltage-violet, soft-mist). El contorno es siempre oscuro para leerse sobre cualquier
 * fondo de escritorio; el vacío es el mismo para todos: es el Éter visto desde dentro.
 */
const VOID = { void0: '#0d0a1a', void1: '#231a42' };

export const FLOW_PALETTES: Record<string, FxPalette> = {
  // Termo-Impulso
  fire: { outline: '#3a0d05', deep: '#a32c06', mid: '#fb4903', light: '#ffa04d', glow: '#fff1c2', ...VOID },
  // Flujo de Datos
  water: { outline: '#0b1d3a', deep: '#1f5fb8', mid: '#4da2ff', light: '#a3d4ff', glow: '#eef8ff', ...VOID },
  // Bio-Red / Raíz Fractal
  plant: { outline: '#0c2a1c', deep: '#1f8a5b', mid: '#55db9c', light: '#a8f0c8', glow: '#f0fff6', ...VOID },
  // Pulso Voltaico
  electric: { outline: '#2b2100', deep: '#b38600', mid: '#ffd731', light: '#fff08a', glow: '#fffbe6', ...VOID },
  // Cifrado / Deep Éter
  shadow: { outline: '#120a26', deep: '#3a2a8c', mid: '#5c4ade', light: '#a99cff', glow: '#ece8ff', ...VOID },
  // Fibra Óptica / Claridad
  light: { outline: '#2f2a3a', deep: '#a89bc4', mid: '#e6dcf5', light: '#fff6d6', glow: '#ffffff', ...VOID },
  // Sin elemento: las hebras del Nexo en su color de lore (lavender)
  neutral: { outline: '#2a2238', deep: '#8a76b8', mid: '#e9ccff', light: '#f6eaff', glow: '#ffffff', ...VOID },
};

export const FLOW_NAMES: Record<string, string> = {
  fire: 'Termo-Impulso',
  water: 'Flujo de Datos',
  plant: 'Bio-Red',
  electric: 'Pulso Voltaico',
  shadow: 'Cifrado',
  light: 'Fibra Óptica',
  neutral: 'Nexo',
};

export function flowPalette(element: string | null | undefined): FxPalette {
  return FLOW_PALETTES[(element ?? '').toLowerCase()] ?? FLOW_PALETTES['neutral'];
}
