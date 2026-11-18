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
 *  3. Color = primario·R + secundario·G de la máscara. Azul puro (sin R ni G) = acento de la paleta.
 *  4. Patrón tileable proyectado por el canal B (aclarado hacia blanco), con desplazamiento por semilla.
 *  5. base.png: líneas casi negras y brillos casi blancos se copian; el resto multiplica (sombreado).
 *  6. Giro de tono en la sombra: cuanto más oscuro el gris de base, más gira el color hacia el
 *     violeta y más se satura. La sombra deja de ser «el mismo color más oscuro».
 */
import { applyHueShiftRgb, deriveVisualTraits, hexToRgb, hslToRgb, rgbToHsl, type Rgb } from '../prng';

/** Tono al que tiran las sombras (violeta frío) y giro máximo en grados. */
const SHADE_HUE = 265;
const SHADE_MAX_DEG = 24;

/**
 * Color de un material en sombra, antes de multiplicar por el gris: gira hacia `SHADE_HUE` por el
 * camino más corto y gana saturación. `dark` va de 0 (tono base) a 1 (negro).
 */
export function shadeShift(r: number, g: number, b: number, dark: number): Rgb {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.04) return [r, g, b]; // los grises no giran
  const delta = ((SHADE_HUE - h + 540) % 360) - 180;
  const turn = Math.sign(delta) * Math.min(Math.abs(delta), SHADE_MAX_DEG) * Math.min(1, dark * 1.6);
  return hslToRgb(h + turn, Math.min(1, s * (1 + dark * 0.35)), l);
}

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA de 8 bits, fila a fila (como `ImageData.data`). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface BakeParams {
  /** `accent` es el tercer color; sin él se usa el primario oscurecido. */
  palette: { primary: string; secondary: string; accent?: string };
  visualSeed: number;
  /** Patrón tileable (blanco con alfa). `null` = sin patrón. */
  pattern?: RgbaImage | null;
}

export interface ResolvedColors {
  primary: Rgb;
  secondary: Rgb;
  accent: Rgb;
  offsetX: number;
  offsetY: number;
}

/** Colores con el giro de tono de la semilla y desplazamiento del patrón. */
export function resolveBakeColors(params: BakeParams): ResolvedColors {
  const traits = deriveVisualTraits(params.visualSeed);
  const primaryHex = hexToRgb(params.palette.primary || '#E25822');
  const accentHex = params.palette.accent ? hexToRgb(params.palette.accent) : (primaryHex.map((c) => Math.round(c * 0.42)) as Rgb);
  return {
    accent: applyHueShiftRgb(accentHex, traits.hueShiftDeg),
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
  const { primary, secondary, accent, offsetX, offsetY } = resolveBakeColors(params);
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

    const isAccent = mR < 0.04 && mG < 0.04;
    let r = isAccent ? accent[0] : primary[0] * mR + secondary[0] * mG;
    let g = isAccent ? accent[1] : primary[1] * mR + secondary[1] * mG;
    let b = isAccent ? accent[2] : primary[2] * mR + secondary[2] * mG;

    if (pp && mB > 0.05 && !isAccent) {
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
        // Solo los grises de sombreado giran el tono; un base.png con color propio multiplica tal cual.
        if (bR === bG && bG === bB && bR < 232) [r, g, b] = shadeShift(r, g, b, (239 - bR) / 239);
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
