/**
 * Mulberry32: Generador de números pseudoaleatorios determinista de 32 bits.
 * Debe ser idéntico en TypeScript, Kotlin y Swift a partir de visualSeed.
 */
export function createMulberry32(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VisualTraits {
  patternOffsetX: number;
  patternOffsetY: number;
  patternScale: number;
  patternRotation: number;
  hueShiftDeg: number;
}

/**
 * Deriva los parámetros cosméticos de la criatura a partir de visualSeed
 */
export function deriveVisualTraits(visualSeed: number): VisualTraits {
  const rng = createMulberry32(visualSeed);
  return {
    patternOffsetX: Math.floor(rng() * 256),
    patternOffsetY: Math.floor(rng() * 256),
    patternScale: 0.85 + rng() * 0.30, // Entre 0.85x y 1.15x
    patternRotation: (rng() - 0.5) * 0.30, // Entre -0.15 y +0.15 rad
    hueShiftDeg: (rng() - 0.5) * 16, // Variación de ±8 grados
  };
}

/**
 * Convierte color hexadecimal #RRGGBB a RGB [r, g, b]
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/**
 * Convierte RGB [r, g, b] a HSL [h (0-360), s (0-1), l (0-1)]
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

/**
 * Convierte HSL a RGB [r, g, b]
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const val = Math.round(l * 255);
    return [val, val, val];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}

/**
 * Aplica una rotación de tono (hue shift en grados) a un color RGB
 */
export function applyHueShiftRgb(rgb: [number, number, number], shiftDeg: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h + shiftDeg, s, l);
}
