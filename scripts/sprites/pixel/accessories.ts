/**
 * Arte de los accesorios en pixel art (GUIA_ARTISTICA §7.6, spec 38 §6).
 *
 * Cada prenda se dibuja tres veces, una por talla (S = baby, M = juvenile, L = adult y final), con
 * el mismo rasterizador que los Pockais y colores literales: la rampa de la prenda, no la paleta de
 * la mascota. El dibujo se hace alrededor del ancla, en el origen (0, 0), y luego se recorta.
 */
import type { EyeSpec } from './face';
import { Grid, hex, N, Ramp, SCALE, translate } from './raster';
import { EYES_BY_SIZE, Slot } from './species';

export type Size = 'S' | 'M' | 'L';
export const SIZES: Size[] = ['S', 'M', 'L'];

/** Rampas de accesorio (GUIA_ARTISTICA §7.6): contorno, sombra, base y luz. Sin brillo. */
const ramp = (line: string, shade: string, base: string, light: string): Ramp => ({ line: hex(line), shade: hex(shade), base: hex(base), light: hex(light), hi: hex(light) });
export const ACC_RAMPS: Record<string, Ramp> = {
  ember: ramp('#3d0e1a', '#c1122d', '#fb4903', '#fb9059'),
  sunburst: ramp('#331b00', '#dfa004', '#ffd731', '#feee8c'),
  mint: ramp('#012825', '#02ab8c', '#55db9c', '#a0f6b1'),
  blue: ramp('#1c1b44', '#4a6dd4', '#4da2ff', '#7fc7fe'),
  violet: ramp('#170c35', '#490ca4', '#5c4ade', '#8a6be9'),
  lavender: ramp('#211e36', '#b1a3d8', '#e9ccff', '#f9e2fe'),
  white: ramp('#4b4862', '#d6d4e0', '#ffffff', '#ffffff'),
  carbon: ramp('#0b0a14', '#17162a', '#3d3a63', '#4b4862'),
};
/** Variante plana: toda la pieza en el tono de luz (ribetes, pompones). */
const lit = (r: Ramp): Ramp => ({ ...r, shade: r.light, base: r.light });

const K: Record<Size, number> = { S: 0.6, M: 0.8, L: 1 };
/**
 * Lienzo máximo por talla, en px nativos: [ancho, alto]. Es ancho porque una bufanda rodea el cuerpo
 * y unas alas asoman por los dos lados. Cada prenda se recorta a su caja mínima.
 */
export const CANVAS: Record<Size, [number, number]> = { S: [40, 24], M: [48, 32], L: [56, 40] };

interface Ctx {
  g: Grid;
  size: Size;
  k: number;
  r: Ramp;
  /** Frame de la animación propia (0 o 1). */
  frame: number;
}
type Draw = (c: Ctx) => void;

// ───────────────────────── Formas ─────────────────────────

/** Gorro de lana: cúpula, ribete y pompón. */
const beanie: Draw = ({ g, k, r }) => {
  g.ellipse(1, 'skin', 0, -1, 8 * k, 6.5 * k, { ramp: r, within: [[-20, -20], [20, -20], [20, -0.5], [-20, -0.5]] });
  g.ellipse(1, 'skin', 0, 0.3, 8 * k + 1, 1.7, { ramp: lit(r), flat: true });
  g.ellipse(2, 'skin', 0, -6.5 * k - 2, Math.max(1.6, 2.4 * k), Math.max(1.6, 2.4 * k), { ramp: lit(r), flat: true });
};

/** Gorro de fiesta: cono con franjas blancas y pompón. */
const partyHat: Draw = ({ g, k, r }) => {
  const h = 11 * k;
  const w = 5.5 * k;
  g.poly(1, 'skin', [[-w, 0.5], [w, 0.5], [0.4, -h]], { ramp: r });
  const stripe = lit(ACC_RAMPS.white);
  g.poly(1, 'skin', [[-w, -h * 0.25], [w, -h * 0.5], [w, -h * 0.34], [-w, -h * 0.09]], { ramp: stripe, flat: true, clip: 1, keep: true });
  g.poly(1, 'skin', [[-w, -h * 0.62], [w, -h * 0.87], [w, -h * 0.72], [-w, -h * 0.47]], { ramp: stripe, flat: true, clip: 1, keep: true });
  g.ellipse(2, 'skin', 0.4, -h - 1, Math.max(1.5, 2 * k), Math.max(1.5, 2 * k), { ramp: lit(ACC_RAMPS.white), flat: true });
};

/** Corona: banda con tres puntas y gemas. Animada: un destello que cambia de punta. */
const crown: Draw = ({ g, k, r, frame }) => {
  const w = 6.5 * k;
  const band = Math.max(2, 3 * k);
  const tip = band + Math.max(2.5, 4 * k);
  g.poly(1, 'skin', [[-w, 0.5], [w, 0.5], [w, -band], [-w, -band]], { ramp: r });
  for (const x of [-w * 0.72, 0, w * 0.72]) g.poly(1, 'skin', [[x - w * 0.3, -band + 0.6], [x + w * 0.3, -band + 0.6], [x, -tip]], { ramp: r });
  const gem = hex('#fb4903');
  const [ox, oy] = g.point(0, 0).map(Math.round);
  g.rect(ox - 1, oy - Math.round(band / 2) - 1, 2, 2, gem, 1);
  if (k >= 0.8) {
    g.put(ox - Math.round(w * 0.6), oy - Math.round(band / 2), hex('#4da2ff'), 1);
    g.put(ox + Math.round(w * 0.6), oy - Math.round(band / 2), hex('#4da2ff'), 1);
  }
  // Destello: salta de la punta izquierda a la derecha.
  const sx = ox + Math.round((frame ? 0.72 : -0.72) * w);
  g.put(sx, oy - Math.round(tip) - 1, hex('#ffffff'), 3);
};

/** Gafas: montura de 1 px alrededor de cada ojo, puente y patilla. El ancla es el punto medio de los ojos. */
const glasses: Draw = ({ g, size, r }) => {
  const e: EyeSpec = EYES_BY_SIZE[size];
  const ax = Math.round((e.x1 + e.x2 + e.w2) / 2);
  const ay = e.y + Math.floor(e.h / 2);
  const c = r.base;
  const [ox, oy] = g.point(0, 0).map(Math.round);
  const box = (x: number, y: number, w: number, h: number) => {
    g.rect(ox + x, oy + y, w, 1, c, 1);
    g.rect(ox + x, oy + y + h - 1, w, 1, c, 1);
    g.rect(ox + x, oy + y, 1, h, c, 1);
    g.rect(ox + x + w - 1, oy + y, 1, h, c, 1);
  };
  const y = e.y - 1 - ay;
  box(e.x1 - 1 - ax, y, e.w1 + 2, e.h + 2);
  box(e.x2 - 1 - ax, y, e.w2 + 2, e.h + 2);
  g.rect(ox + e.x1 + e.w1 + 1 - ax, oy + y + 2, e.x2 - 2 - e.x1 - e.w1, 1, c, 1);
  g.rect(ox + e.x1 - 3 - ax, oy + y + 2, 2, 1, c, 1);
};

/** Bufanda: banda bajo la boca con un cabo que cuelga hacia la izquierda. */
const scarf: Draw = ({ g, size, k, r }) => {
  const rx = { S: 10.5, M: 12, L: 12 }[size];
  g.ellipse(1, 'skin', 0.5, 0, rx, Math.max(1.8, 2.6 * k), { ramp: r });
  g.ellipse(1, 'skin', -rx * 0.62, 4 * k, Math.max(1.6, 2.6 * k), 4.2 * k, { ramp: r });
};

/** Capa: cae por detrás del hombro. Animada: el bajo ondea 1 px. */
const cape: Draw = ({ g, size, r, frame }) => {
  const [cx, cy, rx, ry] = { S: [-4, 2, 7, 7.5], M: [-2, 4, 9, 11], L: [-1.5, 9, 11, 13.5] }[size];
  g.ellipse(1, 'skin', cx - frame, cy, rx + frame * 0.5, ry, { ramp: r });
};

/** Alas: un par grande al lado cercano y la punta del ala lejana asomando por el otro. */
const wings: Draw = ({ g, size, k, r }) => {
  g.ellipse(2, 'skin', { S: 23, M: 26, L: 30 }[size], -5 * k, 4.5 * k, 7 * k, { ramp: r });
  g.ellipse(1, 'skin', -6 * k, -4 * k, 8 * k, 9.5 * k, { ramp: r });
  g.ellipse(1, 'skin', -7.5 * k, 5 * k, 5.5 * k, 6 * k, { ramp: r });
};

// ───────────────────────── Catálogo de arte ─────────────────────────

export interface AccessoryArt {
  slot: Slot;
  color: string;
  draw: Draw;
  /** Frames de la animación propia (1 = sin animación). */
  frames: number;
}

const art = (slot: Slot, color: string, draw: Draw, frames = 1): AccessoryArt => ({ slot, color, draw, frames });

/** Una entrada por prenda de `shared/game-data/accessories.json`. */
export const ACCESSORY_ART: Record<string, AccessoryArt> = {
  acc_gorro_lana_azul: art('head', 'blue', beanie),
  acc_gafas_estudio: art('face', 'ember', glasses),
  acc_bufanda_menta: art('neck', 'mint', scarf),
  acc_gorro_fiesta: art('head', 'sunburst', partyHat),
  acc_capa_gala: art('back', 'violet', cape),
  acc_alas_nube: art('back', 'white', wings),
  ach_item_care_blanket: art('neck', 'lavender', scarf),
  ach_item_care_crown: art('head', 'sunburst', crown, 2),
  ach_item_battle_legend: art('back', 'ember', cape, 2),
};

// ───────────────────────── Rasterizado y recorte ─────────────────────────

export interface AccessorySprite {
  /** Tamaño de un frame y punto de anclaje dentro de él, en px nativos. */
  w: number;
  h: number;
  anchor: [number, number];
  frames: number;
  /** RGBA a ×2, con los frames en horizontal. */
  rgba: Uint8Array;
}

const ORIGIN = 32;

/** Dibuja una prenda en una talla y la recorta a la caja mínima común a sus frames. */
export function renderAccessory(a: AccessoryArt, size: Size): AccessorySprite {
  const grids: Grid[] = [];
  let box: [number, number, number, number] = [N, N, -1, -1];
  for (let frame = 0; frame < a.frames; frame++) {
    const g = new Grid();
    g.with(translate(ORIGIN, ORIGIN), () => a.draw({ g, size, k: K[size], r: ACC_RAMPS[a.color], frame }));
    g.outline();
    const b = g.bounds();
    box = [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])];
    grids.push(g);
  }
  const w = box[2] - box[0] + 1;
  const h = box[3] - box[1] + 1;
  const rgba = new Uint8Array(w * SCALE * a.frames * h * SCALE * 4);
  grids.forEach((g, f) => {
    const full = N * SCALE;
    const base = new Uint8Array(full * full * 4);
    const mask = new Uint8Array(full * full * 4);
    g.blit(base, mask, full, 0, 0);
    for (let y = 0; y < h * SCALE; y++) {
      for (let x = 0; x < w * SCALE; x++) {
        const s = ((box[1] * SCALE + y) * full + box[0] * SCALE + x) * 4;
        const o = (y * w * SCALE * a.frames + f * w * SCALE + x) * 4;
        rgba[o] = base[s]; rgba[o + 1] = base[s + 1]; rgba[o + 2] = base[s + 2]; rgba[o + 3] = base[s + 3];
      }
    }
  });
  return { w, h, anchor: [ORIGIN - box[0], ORIGIN - box[1]], frames: a.frames, rgba };
}
