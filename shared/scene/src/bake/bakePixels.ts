/**
 * Bake de una hoja de sprites (docs/ART_PIPELINE.md §4), como función pura sobre píxeles RGBA.
 *
 * Es la única implementación del algoritmo: el escritorio la llama desde su canvas y la escena de
 * PixiJS (también dentro de los WebView de Android/iOS) sube el resultado como textura. Al ser pura
 * se testea en Node sin DOM ni GPU.
 *
 * Por píxel:
 *  1. Fuera de la silueta (alfa de mask = 0) → transparente.
 *  2. Máscara negra pura → "color literal": se copia base.png tal cual (efectos, comida…).
 *  3. Color = primario·R + secundario·G de la máscara.
 *  4. Patrón tileable proyectado por el canal B (aclarado hacia blanco), con desplazamiento por semilla.
 *  5. base.png: líneas casi negras y brillos casi blancos se copian; el resto multiplica (sombreado).
 */
import { applyHueShiftRgb, deriveVisualTraits, hexToRgb, type Rgb } from '../prng';

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA de 8 bits, fila a fila (como `ImageData.data`). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface BakeParams {
  palette: { primary: string; secondary: string };
  visualSeed: number;
  /** Patrón tileable (blanco con alfa). `null` = sin patrón. */
  pattern?: RgbaImage | null;
}

export interface ResolvedColors {
  primary: Rgb;
  secondary: Rgb;
  offsetX: number;
  offsetY: number;
}

/** Colores con el giro de tono de la semilla y desplazamiento del patrón. */
export function resolveBakeColors(params: BakeParams): ResolvedColors {
  const traits = deriveVisualTraits(params.visualSeed);
  return {
    primary: applyHueShiftRgb(hexToRgb(params.palette.primary || '#E25822'), traits.hueShiftDeg),
    secondary: applyHueShiftRgb(hexToRgb(params.palette.secondary || '#F3C544'), traits.hueShiftDeg),
    offsetX: traits.patternOffsetX,
    offsetY: traits.patternOffsetY,
  };
}

/** Hornea `base` + `mask` (mismas dimensiones) en un buffer RGBA nuevo. */
export function bakePixels(base: RgbaImage, mask: RgbaImage, params: BakeParams): Uint8ClampedArray {
  if (base.width !== mask.width || base.height !== mask.height) {
    throw new Error(`base (${base.width}×${base.height}) y mask (${mask.width}×${mask.height}) deben medir lo mismo`);
  }
  const { width, height } = base;
  const bp = base.data;
  const mp = mask.data;
  const out = new Uint8ClampedArray(width * height * 4);
  const { primary, secondary, offsetX, offsetY } = resolveBakeColors(params);
  const pat = params.pattern ?? null;
  const pp = pat?.data;
  const patW = pat?.width ?? 256;
  const patH = pat?.height ?? 256;

  const total = width * height;
  for (let i = 0; i < total; i++) {
    const px = i * 4;
    const maskA = mp[px + 3];
    if (maskA === 0) continue; // transparente (el buffer ya está a 0)

    const mR = mp[px] / 255;
    const mG = mp[px + 1] / 255;
    const mB = mp[px + 2] / 255;

    if (mR < 0.04 && mG < 0.04 && mB < 0.04) {
      out[px] = bp[px];
      out[px + 1] = bp[px + 1];
      out[px + 2] = bp[px + 2];
      out[px + 3] = Math.min(maskA, bp[px + 3]);
      continue;
    }

    let r = primary[0] * mR + secondary[0] * mG;
    let g = primary[1] * mR + secondary[1] * mG;
    let b = primary[2] * mR + secondary[2] * mG;

    if (pp && mB > 0.05) {
      const x = i % width;
      const y = (i / width) | 0;
      const u = (x + offsetX) % patW;
      const v = (y + offsetY) % patH;
      const pa = (pp[(v * patW + u) * 4 + 3] / 255) * mB;
      if (pa > 0) {
        r = r * (1 - pa) + 255 * pa;
        g = g * (1 - pa) + 255 * pa;
        b = b * (1 - pa) + 255 * pa;
      }
    }

    const bR = bp[px];
    const bG = bp[px + 1];
    const bB = bp[px + 2];
    if (bp[px + 3] > 0) {
      if ((bR < 40 && bG < 40 && bB < 40) || (bR > 240 && bG > 240 && bB > 240)) {
        r = bR;
        g = bG;
        b = bB;
      } else {
        r = (r * bR) / 255;
        g = (g * bG) / 255;
        b = (b * bB) / 255;
      }
    }

    out[px] = Math.round(r);
    out[px + 1] = Math.round(g);
    out[px + 2] = Math.round(b);
    out[px + 3] = maskA;
  }
  return out;
}
