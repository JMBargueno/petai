import type { CanvasPalette, ThemeManifest } from './types';

/** Destellos de siempre: neón frío sobre el cielo nocturno del clan. */
const canvas: CanvasPalette = {
  sparkle: ['#ffffff', '#ffe27a', '#9ff3ff', '#c9a6ff'],
  confetti: ['#ffd84d', '#ff8fd1', '#7ee8ff'],
  firefly: '#e9ff8a',
  ember: ['#ffb347', '#ff6a3d'],
  wisp: ['#9ff3ff', '#c9a6ff'],
  star: '#ffffff',
  glowRgb: '255, 255, 255',
};

/** El aspecto de Pockai de siempre: sus tokens son los de tokens.css, sin fichero de tema propio. */
export const classic: ThemeManifest = {
  id: 'classic',
  name: 'Clásico',
  description: 'Los colores de siempre de Pockai: lavanda, cielo y menta.',
  schemes: ['light', 'dark'],
  swatch: {
    light: ['#fbfaff', '#ffffff', '#5c4ade'],
    dark: ['#0d0c19', '#17162a', '#b3a8ff'],
  },
  canvas: { light: canvas, dark: canvas },
};
