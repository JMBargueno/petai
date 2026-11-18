/**
 * Efectos animados sobre el sprite horneado: los de los patrones de la Textura del Éter y el de la
 * variante shiny. Funciones puras sobre píxeles, como el horneado: las usan igual el escritorio
 * (canvas 2D) y la escena de PixiJS, y se testean en Node.
 *
 * Dos pasos:
 *  1. `bakeFxMap` (una vez por hoja): guarda, para cada píxel de la silueta, en qué punto del
 *     patrón cae y si es marca de tono, destello o cuerpo liso.
 *  2. `renderFx` (unas 11 veces por segundo, solo el frame visible): devuelve una capa RGBA que se
 *     pinta encima del frame. El tiempo va a saltos de `FX_STEP_MS` y todo se calcula en píxeles
 *     nativos, así que el efecto se mueve como pixel art y no como un brillo suave.
 *
 * La intensidad sigue a la rareza: sutil en los superraros, visible en los legendarios y constante
 * en el mítico.
 */
import { deriveVisualTraits, hslToRgb } from '../prng';
import type { RgbaImage } from './bakePixels';

export type PatternFx = 'sheen' | 'twinkle' | 'flow' | 'starfield' | 'flash' | 'aurora';

/** Efecto de cada patrón (el mismo dato que `fx` en `shared/game-data/patterns.json`). */
export const PATTERN_FX: Record<string, PatternFx> = {
  scales: 'sheen',
  crystal: 'twinkle',
  circuit: 'flow',
  galaxy: 'starfield',
  storm: 'flash',
  aurora: 'aurora',
};

/** Paso de tiempo de los efectos: unos 11 fotogramas por segundo. */
export const FX_STEP_MS = 90;

/** Canal B del mapa: qué es cada píxel de la silueta. */
export const FX_BODY = 0;
export const FX_TONE = 1;
export const FX_GLINT = 2;

export interface FxMapParams {
  /** El mismo patrón que se pasó al horneado; `null` = sin patrón (solo silueta, para el shiny). */
  pattern?: RgbaImage | null;
  visualSeed: number;
  pixelSize?: number;
}

/**
 * Mapa de efectos de una hoja: RGBA del tamaño de `mask`. Alfa 255 dentro de la silueta; R y G son
 * las coordenadas del píxel en el patrón (0–255) y B dice si es cuerpo, marca de tono o destello.
 */
export function bakeFxMap(mask: RgbaImage, params: FxMapParams): Uint8ClampedArray {
  const { width, height } = mask;
  const mp = mask.data;
  const out = new Uint8ClampedArray(width * height * 4);
  const traits = deriveVisualTraits(params.visualSeed);
  const cell = Math.max(1, Math.round(params.pixelSize ?? 2));
  const pat = params.pattern ?? null;
  const patW = pat?.width ?? 256;
  const patH = pat?.height ?? 256;
  for (let i = 0; i < width * height; i++) {
    const px = i * 4;
    if (mp[px + 3] === 0) continue;
    const u = ((((i % width) / cell) | 0) + traits.patternOffsetX) % patW;
    const v = (((((i / width) | 0) / cell) | 0) + traits.patternOffsetY) % patH;
    let kind = FX_BODY;
    // Misma regla que el horneado: el patrón solo cae donde hay canal B y no es acento ni literal.
    const literal = mp[px] < 10 && mp[px + 1] < 10 && mp[px + 2] < 10;
    const accent = mp[px] < 10 && mp[px + 1] < 10;
    if (pat && !literal && !accent && mp[px + 2] > 12) {
      const k = (v * patW + u) * 4;
      if (pat.data[k + 3] >= 128) kind = pat.data[k] < 128 ? FX_GLINT : FX_TONE;
    }
    out[px] = u & 255;
    out[px + 1] = v & 255;
    out[px + 2] = kind;
    out[px + 3] = 255;
  }
  return out;
}

export interface FxFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FxOptions {
  /** Efecto del patrón, o nada. */
  fx?: PatternFx | null;
  shiny?: boolean;
  /** Milisegundos desde que se muestra la mascota. */
  time: number;
  pixelSize?: number;
}

/** Azar determinista en [0, 1) a partir de dos enteros y una sal. */
function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (v: number, m: number) => ((v % m) + m) % m;

type Px = [number, number, number, number];
const NONE: Px = [0, 0, 0, 0];

/** Color (0–255) y alfa (0–1) que el efecto del patrón pone sobre un píxel. */
function patternPixel(fx: PatternFx, kind: number, u: number, v: number, lx: number, ly: number, t: number): Px {
  if (kind === FX_BODY) return NONE;
  const glint = kind === FX_GLINT;
  switch (fx) {
    // Superraro. Un brillo cruza las escamas en diagonal cada cinco segundos.
    case 'sheen': {
      const p = mod(t, 5200) / 1100;
      if (p > 1) return NONE;
      const d = Math.abs(lx + ly - (p * 150 - 12));
      return d < 4 ? [255, 255, 255, glint ? 0.7 : 0.35] : NONE;
    }
    // Superraro. Cada vértice del cristal centellea por su cuenta, de uno en uno.
    case 'twinkle': {
      if (!glint) return NONE;
      const q = mod(t + hash(u, v, 1) * 3600, 3600);
      if (q > 360) return NONE;
      return [255, 255, 255, 0.9 * (1 - Math.abs(q - 180) / 180)];
    }
    // Superraro. Un pulso de luz recorre las pistas del circuito.
    case 'flow': {
      const m = mod(u + v * 3 - t / 45, 48);
      if (m < 5) return [190, 255, 255, (1 - m / 5) * (glint ? 0.9 : 0.6)];
      return NONE;
    }
    // Legendario. Las estrellas titilan con fuerza y la nebulosa va del azul al magenta.
    case 'starfield': {
      if (glint) {
        const period = 1400 + hash(u, v, 2) * 1200;
        const a = 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2 + hash(u, v, 3) * 6.28);
        return [255, 255, 255, a];
      }
      const hue = 250 + 60 * Math.sin(t / 2600 + (u + v) / 20);
      const [r, g, b] = hslToRgb(hue, 0.85, 0.66);
      return [r, g, b, 0.5];
    }
    // Legendario. Cada rayo descarga por separado; su nube se enciende con él.
    case 'flash': {
      const q = mod(t + hash(u >> 5, v >> 5, 4) * 2600, 2600);
      const power = q < 120 ? 1 : q < 240 ? 0 : q < 330 ? 0.8 : q < 800 ? 0.5 * (1 - (q - 330) / 470) : 0;
      if (glint) return [255, 250, 190, Math.max(power, 0.3 + 0.1 * Math.sin(t / 300 + u))];
      return power === 0 ? NONE : [235, 235, 255, power * 0.45];
    }
    // Mítico. Las cintas cambian de color sin parar y una ola de luz sube por ellas.
    case 'aurora': {
      const hue = 150 + 70 * Math.sin(v * 0.12 + t / 700) + u * 2 + t / 30;
      const wave = 0.5 + 0.5 * Math.sin(v * 0.3 - t / 240);
      if (glint) return [255, 255, 255, 0.35 + 0.65 * wave];
      const [r, g, b] = hslToRgb(mod(hue, 360), 0.9, 0.62 + 0.12 * wave);
      return [r, g, b, 0.6 + 0.3 * wave];
    }
  }
}

/** Ciclo del shiny: un barrido irisado al empezar y destellos en estrella durante todo el ciclo. */
const SHINY_CYCLE = 4000;
const SHINY_SWEEP = 900;
const SPARKLE_SLOT = 1300;
/** Formas del destello según avanza: punto, cruz, estrella y otra vez cruz. */
const SPARKLE_SHAPES: [number, number][][] = [
  [[0, 0]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]],
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
];

/**
 * Capa de efectos de un frame: RGBA (alfa sin premultiplicar) de `frame.w × frame.h`, para pintar
 * encima del frame horneado. `out` permite reutilizar el buffer entre llamadas.
 */
export function renderFx(map: ArrayLike<number>, sheetWidth: number, frame: FxFrame, opts: FxOptions, out?: Uint8ClampedArray): Uint8ClampedArray {
  const { w, h } = frame;
  const buf = out && out.length === w * h * 4 ? out : new Uint8ClampedArray(w * h * 4);
  buf.fill(0);
  const cell = Math.max(1, Math.round(opts.pixelSize ?? 2));
  const t = Math.floor(opts.time / FX_STEP_MS) * FX_STEP_MS;
  const fx = opts.fx ?? null;
  const sweep = opts.shiny ? mod(t, SHINY_CYCLE) / SHINY_SWEEP : 2;
  const at = (x: number, y: number) => ((frame.y + y) * sheetWidth + frame.x + x) * 4;

  if (fx || sweep <= 1) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = at(x, y);
        if (map[m + 3] === 0) continue;
        const lx = (x / cell) | 0;
        const ly = (y / cell) | 0;
        let [r, g, b, a] = fx ? patternPixel(fx, map[m + 2], map[m], map[m + 1], lx, ly, t) : NONE;
        if (sweep <= 1) {
          // Barrido del shiny: una banda ancha irisada y otra fina detrás, sobre toda la silueta.
          const d = lx + ly - (sweep * 150 - 12);
          const sa = Math.abs(d) < 3 ? 0.75 : Math.abs(d + 8) < 1 ? 0.45 : 0;
          if (sa > a) {
            [r, g, b] = hslToRgb(mod((lx + ly) * 7 + t / 8, 360), 1, 0.86);
            a = sa;
          }
        }
        if (a <= 0) continue;
        const o = (y * w + x) * 4;
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
        buf[o + 3] = Math.round(a * 255);
      }
    }
  }

  if (opts.shiny) {
    // Tres destellos que se relevan: cada uno nace sobre el cuerpo, crece a estrella y se apaga.
    const nw = (w / cell) | 0;
    const nh = (h / cell) | 0;
    for (let k = 0; k < 3; k++) {
      const tk = t + k * 433;
      const n = Math.floor(tk / SPARKLE_SLOT);
      const q = mod(tk, SPARKLE_SLOT) / 520;
      if (q >= 1) continue;
      // Hasta seis intentos de caer dentro de la silueta; si no, ese destello se salta.
      for (let tryN = 0; tryN < 6; tryN++) {
        const cx = Math.floor(hash(n, k * 7 + tryN, 5) * nw);
        const cy = Math.floor(hash(n, k * 7 + tryN, 6) * nh);
        if (map[at(cx * cell, cy * cell) + 3] === 0) continue;
        for (const [dx, dy] of SPARKLE_SHAPES[Math.min(3, Math.floor(q * 4))]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= nw || ny >= nh) continue;
          for (let sy = 0; sy < cell; sy++) for (let sx = 0; sx < cell; sx++) {
            const o = ((ny * cell + sy) * w + nx * cell + sx) * 4;
            buf[o] = 255;
            buf[o + 1] = 255;
            buf[o + 2] = dx === 0 && dy === 0 ? 255 : 220;
            buf[o + 3] = 255;
          }
        }
        break;
      }
    }
  }
  return buf;
}

/** ¿Hay algo que animar? Sin efecto de patrón ni shiny no hace falta la capa. */
export function hasFx(patternId: string | null | undefined, shiny: boolean | undefined): boolean {
  return !!shiny || !!(patternId && PATTERN_FX[patternId]);
}
