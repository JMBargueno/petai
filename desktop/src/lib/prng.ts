/**
 * Mulberry32 y rasgos visuales de `visualSeed`. La implementación vive en el núcleo compartido
 * (`shared/scene/src/prng.ts`) para que escritorio, Android e iOS (vía la escena) den lo mismo.
 */
export {
  createMulberry32,
  deriveVisualTraits,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  applyHueShiftRgb,
  type VisualTraits,
} from '@pockai/scene/bake';
