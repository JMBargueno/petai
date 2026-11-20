import type { CanvasPalette, ThemeManifest } from './types';

/** Destellos cálidos: miel, melocotón y luz de vela en lugar del neón frío. */
const canvas: CanvasPalette = {
  sparkle: ['#fff4e0', '#ffd27a', '#ffb38a', '#f2c9a0'],
  confetti: ['#ffc857', '#ff9f80', '#b5d99c'],
  firefly: '#ffe08a',
  ember: ['#ffb347', '#ff7a45'],
  wisp: ['#ffd9a8', '#f4b8a0'],
  star: '#fff4e0',
  glowRgb: '255, 236, 205',
};

/** Acogedor: crema, madera y terracota de día; luz de vela de noche. Estilos en styles/themes/cozy.css. */
export const cozy: ThemeManifest = {
  id: 'cozy',
  name: 'Cozy',
  description: 'Crema, madera y terracota; de noche, luz de vela.',
  schemes: ['light', 'dark'],
  swatch: {
    light: ['#fbf4e8', '#fffaf2', '#c8643b'],
    dark: ['#1a1410', '#241b15', '#f0a77f'],
  },
  canvas: { light: canvas, dark: canvas },
};
