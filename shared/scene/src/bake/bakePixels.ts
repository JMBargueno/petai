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
 *  4. Patrón tileable proyectado por el canal B, con desplazamiento por semilla. Cada píxel del
 *     patrón es un píxel NATIVO del sprite (`pixelSize` píxeles de hoja), así que el dibujo cae en
 *     la rejilla del pixel art. No pinta blanco: es un tono del propio color, más claro en especies
 *     oscuras y más oscuro en las claras. Un píxel de patrón no blanco es un destello (casi blanco).
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
  /** Patrón tileable en píxeles nativos: blanco = marca de tono, otro color = destello, alfa < 128 = nada. `null` = sin patrón. */
  pattern?: RgbaImage | null;
  /** Píxeles de hoja por píxel nativo del sprite (2 en las hojas de 128 px por frame). */
  pixelSize?: number;
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

/** Por debajo de esta luminancia del primario, el patrón aclara; por encima, oscurece. */
const PATTERN_LIGHT_BELOW = 150;

/** Color de una marca de patrón sobre `(r, g, b)`: un tono del mismo color, o un destello. */
export function patternTone(r: number, g: number, b: number, lighten: boolean, glint: boolean, amount = 1): Rgb {
  let t: Rgb;
  if (glint) {
    t = [r + (255 - r) * 0.72, g + (255 - g) * 0.72, b + (255 - b) * 0.72];
  } else if (lighten) {
    const [h, sat, l] = rgbToHsl(r, g, b);
    t = hslToRgb(h, sat * 0.92, l + (1 - l) * 0.38);
  } else {
    const [sr, sg, sb] = shadeShift(r, g, b, 0.35);
    t = [sr * 0.72, sg * 0.72, sb * 0.72];
  }
  return [r + (t[0] - r) * amount, g + (t[1] - g) * amount, b + (t[2] - b) * amount];
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
  const cell = Math.max(1, Math.round(params.pixelSize ?? 2));
  const lighten = 0.299 * primary[0] + 0.587 * primary[1] + 0.114 * primary[2] < PATTERN_LIGHT_BELOW;

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
      const x = ((i % width) / cell) | 0;
      const y = (((i / width) | 0) / cell) | 0;
      const k = (((y + offsetY) % patH) * patW + ((x + offsetX) % patW)) * 4;
      if (pp[k + 3] >= 128) [r, g, b] = patternTone(r, g, b, lighten, pp[k] < 128, mB);
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
