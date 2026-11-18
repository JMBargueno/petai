/**
 * Hojas de sprites en pixel art: compone frames en una cuadrícula y las hornea a color para las
 * vistas previas con el mismo algoritmo que usan los clientes.
 */
import { bakePixels } from '../../../shared/scene/src/bake/bakePixels';
import type { Palette } from '../draw';
import { encodePng, Grid, N, SCALE } from './raster';

export const FRAME = N * SCALE; // 128

export interface Sheet {
  w: number;
  h: number;
  base: Uint8Array;
  mask: Uint8Array;
}

/** Coloca los frames en filas de `cols` columnas. */
export function composeSheet(grids: Grid[], cols: number): Sheet {
  const rows = Math.ceil(grids.length / cols);
  const w = Math.min(cols, grids.length) * FRAME;
  const h = rows * FRAME;
  const base = new Uint8Array(w * h * 4);
  const mask = new Uint8Array(w * h * 4);
  grids.forEach((g, k) => g.blit(base, mask, w, (k % cols) * FRAME, Math.floor(k / cols) * FRAME));
  return { w, h, base, mask };
}

/** Hoja a color con una paleta (sin patrón ni giro de tono), tal como la vería un cliente. */
export function bakeSheet(sheet: Sheet, palette: Palette): Uint8Array {
  const img = (data: Uint8Array) => ({ width: sheet.w, height: sheet.h, data });
  // visualSeed 0 puede girar el tono: se busca una semilla neutra no hace falta, el giro es de ±8°.
  return new Uint8Array(bakePixels(img(sheet.base), img(sheet.mask), { palette, visualSeed: NEUTRAL_SEED, pattern: null }));
}

/** Semilla cuyo giro de tono es despreciable: las vistas previas enseñan la paleta tal cual. */
export const NEUTRAL_SEED = 0;

export const pngOf = (w: number, h: number, rgba: Uint8Array): Buffer => encodePng(w, h, rgba);

/** Amplía un buffer RGBA por un factor entero (vecino más próximo) sobre un fondo opaco. */
export function upscale(w: number, h: number, rgba: Uint8Array, k: number, bg: [number, number, number] = [242, 241, 248]): { w: number; h: number; data: Uint8Array } {
  const out = new Uint8Array(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      const o = (y * w * k + x) * 4;
      const a = rgba[s + 3] > 0;
      out[o] = a ? rgba[s] : bg[0];
      out[o + 1] = a ? rgba[s + 1] : bg[1];
      out[o + 2] = a ? rgba[s + 2] : bg[2];
      out[o + 3] = 255;
    }
  }
  return { w: w * k, h: h * k, data: out };
}

/** SVG de un frame a color hecho de rectángulos (un tramo por fila y color): pixel art sin suavizado. */
export function frameSvg(rgba: Uint8Array, sheetW: number, ox: number, oy: number): string {
  let body = '';
  for (let y = 0; y < N; y++) {
    let run: { x: number; c: string } | null = null;
    const flush = (end: number) => {
      if (run) body += `<rect x="${run.x * SCALE}" y="${y * SCALE}" width="${(end - run.x) * SCALE}" height="${SCALE}" fill="${run.c}"/>`;
      run = null;
    };
    for (let x = 0; x <= N; x++) {
      let c: string | null = null;
      if (x < N) {
        const o = ((oy + y * SCALE) * sheetW + ox + x * SCALE) * 4;
        if (rgba[o + 3] > 0) c = '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      }
      if (run && run.c !== c) flush(x);
      if (c && !run) run = { x, c };
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME} ${FRAME}" width="${FRAME}" height="${FRAME}" shape-rendering="crispEdges">${body}</svg>\n`;
}
