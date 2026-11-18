/**
 * Carcasa de cada sala del hábitat (paredes, suelo, losa y su elemento característico).
 *
 * Cada sala tiene su propia arquitectura, elegida por el id de la sala (`styleFor`); los colores
 * siguen saliendo de `theme` en habitats.json, pero cada estilo interpreta las 7 claves a su
 * manera (ver el comentario de cada uno). La rejilla, la colocación y los muebles de pared no
 * cambian: todas las salas tienen una superficie en los dos bordes del fondo (x = 0, y = 0).
 *
 * Reglas de GUIA_ARTISTICA §7.4: luz desde arriba a la izquierda (pared izquierda = base, derecha
 * = −18 %), tres tonos por volumen, contorno exterior #1A1A1A de 2 px, aristas interiores a
 * 1–1,5 px y 60 %, sin degradados realistas.
 *
 * Todo lo "aleatorio" (matas, flores, estrellas) sale de `cellHash`: el anfitrión reenvía la sala
 * con cada movimiento de mueble y la decoración no debe saltar al redibujar.
 */
import type { Graphics } from 'pixi.js';
import type { RoomTheme } from '../protocol';
import { toScreen } from '../iso/projection';

export const WALL_H = 92;
export const SLAB = 10;
export const LINE = 0x1a1a1a;
/** Largo en pantalla de una celda a lo largo de un eje (√(16² + 8²)): para círculos en una pared. */
const CELL_PX = 17.9;

export type StyleId = 'interior' | 'garden' | 'shrine' | 'celestial';

export interface ShellCtx {
  g: Graphics;
  t: RoomTheme;
  W: number;
  H: number;
}

/** Estrella que titila (capa ambiental, en píxeles de la sala). */
export interface Twinkle {
  x: number;
  y: number;
  size: number;
  phase: number;
}

export interface RoomStyle {
  id: StyleId;
  /** Píxeles que sobresalen por encima de las paredes (copa del árbol…). */
  topExtra: number;
  /** Píxeles que cuelgan por debajo de la losa (cristales…). */
  bottomExtra: number;
  /** Sala al aire libre: la lluvia y la nieve caen dentro y el Pockai busca resguardo. */
  exterior?: boolean;
  /** La sala trae su propio cielo (Cita Final): no se le cambian los colores con la hora. */
  ownSky?: boolean;
  draw(c: ShellCtx): void;
  twinkles?(W: number, H: number): Twinkle[];
}

const BY_ROOM: Record<string, StyleId> = {
  sala: 'interior',
  jardin: 'garden',
  santuario: 'shrine',
  citafinal: 'celestial',
};

/** Estilo de una sala; las desconocidas usan el interior clásico. */
export function styleFor(roomId: string | null | undefined): RoomStyle {
  return STYLES[BY_ROOM[roomId ?? ''] ?? 'interior'];
}

// ───────────────────────── Utilidades ─────────────────────────

export const hex = (c: string) => parseInt(c.replace('#', ''), 16);

/** Aclara (k > 0) u oscurece (k < 0) un color. */
export function shade(n: number, k: number): number {
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)),
  );
  return (ch[0] << 16) | (ch[1] << 8) | ch[2];
}

export const shadeHex = (color: string, k: number) => shade(hex(color), k);

/** Hash determinista en [0, 1) de una celda (o de un índice) y una sal. */
export function cellHash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x3c6e, 0x165667b1) ^ Math.imul((salt | 0) + 0x7f4a, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const P = (x: number, y: number, z = 0) => {
  const s = toScreen(x, y, z);
  return [s.x, s.y];
};

const INNER = { width: 1.5, color: LINE, alpha: 0.6 } as const;

function line(g: Graphics, pts: number[], width: number, color: number, alpha = 1): void {
  g.poly(pts, false).stroke({ width, color, alpha });
}

/** Losa del suelo: grosor visible en los dos bordes delanteros. */
function slab(c: ShellCtx, right: number, left: number, depth = SLAB): void {
  const { g, W, H } = c;
  g.poly([...P(W, 0), ...P(W, H), ...P(W, H, -depth), ...P(W, 0, -depth)]).fill(right).stroke({ width: 2, color: LINE });
  g.poly([...P(0, H), ...P(W, H), ...P(W, H, -depth), ...P(0, H, -depth)]).fill(left).stroke({ width: 2, color: LINE });
}

/** Franja horizontal en las dos caras delanteras de la losa (labio de césped, filo dorado). */
function slabStrip(c: ShellCtx, z0: number, z1: number, right: number, left: number): void {
  const { g, W, H } = c;
  g.poly([...P(W, 0, z0), ...P(W, H, z0), ...P(W, H, z1), ...P(W, 0, z1)]).fill(right);
  g.poly([...P(0, H, z0), ...P(W, H, z0), ...P(W, H, z1), ...P(0, H, z1)]).fill(left);
}

/** Paredes lisas: izquierda (a lo largo de x = 0) y derecha (a lo largo de y = 0). */
function walls(c: ShellCtx, left: number, right: number, h = WALL_H): void {
  const { g, W, H } = c;
  g.poly([...P(0, 0, h), ...P(0, H, h), ...P(0, H), ...P(0, 0)]).fill(left);
  g.poly([...P(0, 0, h), ...P(W, 0, h), ...P(W, 0), ...P(0, 0)]).fill(right);
}

/** Franja a lo largo de las dos paredes entre dos alturas (zócalo, vigas, molduras). */
function band(c: ShellCtx, z0: number, z1: number, left: number, right: number): void {
  const { g, W, H } = c;
  g.poly([...P(0, 0, z1), ...P(0, H, z1), ...P(0, H, z0), ...P(0, 0, z0)]).fill(left);
  g.poly([...P(0, 0, z1), ...P(W, 0, z1), ...P(W, 0, z0), ...P(0, 0, z0)]).fill(right);
}

function floorCells(c: ShellCtx, color: (x: number, y: number) => number): void {
  const { g, W, H } = c;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      g.poly([...P(x, y), ...P(x + 1, y), ...P(x + 1, y + 1), ...P(x, y + 1)]).fill(color(x, y));
    }
  }
}

function floorBorder(c: ShellCtx): void {
  const { g, W, H } = c;
  g.poly([...P(0, 0), ...P(W, 0), ...P(W, H), ...P(0, H)]).stroke({ width: 2, color: LINE });
}

/** Contorno abierto de las paredes (sin cerrar: si no, cruzaría el suelo en diagonal). */
function wallOutline(c: ShellCtx, h = WALL_H): void {
  const { g, W, H } = c;
  line(g, [...P(0, H), ...P(0, H, h), ...P(0, 0, h), ...P(W, 0, h), ...P(W, 0)], 2, LINE);
  line(g, [...P(0, 0), ...P(0, 0, h)], 1.5, LINE, 0.6);
}

/**
 * Pilar o columna de base cuadrada `s` en (px, py), entre dos alturas. Se ven la cara que mira a
 * +y (iluminada) y la que mira a +x (en sombra).
 */
function pillar(c: ShellCtx, px: number, py: number, s: number, z0: number, z1: number, base: number): void {
  const { g } = c;
  g.poly([...P(px, py + s, z0), ...P(px + s, py + s, z0), ...P(px + s, py + s, z1), ...P(px, py + s, z1)])
    .fill(base)
    .stroke(INNER);
  g.poly([...P(px + s, py, z0), ...P(px + s, py + s, z0), ...P(px + s, py + s, z1), ...P(px + s, py, z1)])
    .fill(shade(base, -0.18))
    .stroke(INNER);
}

/** Puntos de un arco en la pared derecha (plano y = 0), con radio `r` en celdas. */
function rightWallArc(cx: number, cz: number, r: number, from: number, to: number, n = 32): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push(...P(cx + r * Math.cos(a), 0, cz + r * CELL_PX * Math.sin(a)));
  }
  return pts;
}

/** Puntos de un círculo en el suelo (radio en celdas). */
function floorRing(cx: number, cy: number, r: number, n = 40): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(...P(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/** Destello de cuatro puntas. */
export function sparkle(g: Graphics, x: number, y: number, s: number, color: number, alpha = 1): void {
  const k = s * 0.28;
  g.poly([x, y - s, x + k, y - k, x + s, y, x + k, y + k, x, y + s, x - k, y + k, x - s, y, x - k, y - k]).fill({
    color,
    alpha,
  });
}

// ───────────────────────── Sala principal (interior clásico) ─────────────────────────
// wall/wallShade: paredes · floor: parqué · trim: zócalo, losa y marco · sky: ventana · light: luz.

function drawInterior(c: ShellCtx): void {
  const { g, t, W, H } = c;
  slab(c, hex(t.trim), shadeHex(t.trim, 0.12));
  walls(c, hex(t.wall), hex(t.wallShade));
  band(c, 0, 8, hex(t.trim), shadeHex(t.trim, -0.12));
  // Ventana en la pared derecha
  const wx0 = W * 0.55;
  const wx1 = Math.min(W - 1, wx0 + 3);
  g.poly([...P(wx0, 0, 70), ...P(wx1, 0, 70), ...P(wx1, 0, 36), ...P(wx0, 0, 36)])
    .fill(hex(t.sky))
    .stroke({ width: 3, color: hex(t.trim) });
  line(g, [...P((wx0 + wx1) / 2, 0, 70), ...P((wx0 + wx1) / 2, 0, 36)], 2, hex(t.trim));
  const glow = toScreen((wx0 + wx1) / 2 + 1, 2.5);
  g.ellipse(glow.x, glow.y, 70, 35).fill({ color: hex(t.light), alpha: 0.35 });
  floorCells(c, (x, y) => ((x + y) % 2 === 1 ? shadeHex(t.floor, -0.06) : hex(t.floor)));
  floorBorder(c);
  wallOutline(c);
}

// ───────────────────────── Jardín (exterior) ─────────────────────────
// wall: seto · wallShade: valla · floor/floorAlt: césped · trim: tierra de la losa · sky: sin uso
// (el cielo es el fondo) · light: sol.

const HEDGE = 56;
const FENCE = 32;
const TRUNK = 0x8a5a35;
const STONE = 0xd6cfbf;
const FLOWERS = [0xff8fb1, 0xffd84d, 0xffffff, 0xb79cff];

/** Altura del seto en una posición del borde (bultos redondeados, uno por celda). */
function hedgeZ(pos: number, side: number): number {
  const cell = Math.floor(pos);
  const f = pos - cell;
  const bump = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
  return HEDGE + bump * (5 + 4 * cellHash(cell, side, 21));
}

function drawHedge(c: ShellCtx, side: 0 | 1): void {
  const { g, t, W, H } = c;
  const len = side === 0 ? H : W;
  const at = (pos: number, z: number) => (side === 0 ? P(0, pos, z) : P(pos, 0, z));
  const base = side === 0 ? hex(t.wall) : shadeHex(t.wall, -0.18);
  const top: number[] = [];
  const steps = len * 6;
  for (let i = 0; i <= steps; i++) {
    const pos = (i / steps) * len;
    top.push(...at(pos, hedgeZ(Math.min(pos, len - 1e-6), side)));
  }
  g.poly([...at(0, 0), ...top, ...at(len, 0)]).fill(base);
  // Hojas: brillos arriba y sombras abajo, en sitios fijos por celda
  for (let k = 0; k < len; k++) {
    for (let j = 0; j < 2; j++) {
      const p = k + 0.25 + 0.5 * j;
      const hl = at(p, HEDGE - 6 - 10 * cellHash(k, j, 22 + side));
      g.ellipse(hl[0], hl[1], 5, 3).fill(shade(base, 0.12));
      const dk = at(p + 0.2, 14 + 18 * cellHash(k, j, 24 + side));
      g.ellipse(dk[0], dk[1], 4, 2.5).fill(shade(base, -0.12));
    }
  }
  line(g, top, 2, LINE);
}

function drawFence(c: ShellCtx, side: 0 | 1): void {
  const { g, t, W, H } = c;
  const len = side === 0 ? H : W;
  const at = (pos: number, z: number) => (side === 0 ? P(0, pos, z) : P(pos, 0, z));
  const wood = side === 0 ? hex(t.wallShade) : shadeHex(t.wallShade, -0.18);
  for (const [z0, z1] of [
    [10, 14],
    [22, 26],
  ]) {
    g.poly([...at(0, z1), ...at(len, z1), ...at(len, z0), ...at(0, z0)]).fill(shade(wood, -0.08)).stroke(INNER);
  }
  for (let p = 0.25; p < len; p += 0.5) {
    g.poly([...at(p - 0.08, 0), ...at(p + 0.08, 0), ...at(p + 0.08, FENCE), ...at(p, FENCE + 5), ...at(p - 0.08, FENCE)])
      .fill(wood)
      .stroke({ width: 1.2, color: LINE, alpha: 0.8 });
  }
}

function drawTree(c: ShellCtx): void {
  const { g, t } = c;
  // Tronco en la esquina del fondo (origen), detrás de los setos
  g.rect(-5, -96, 5, 60).fill(TRUNK);
  g.rect(0, -96, 5, 60).fill(shade(TRUNK, -0.18));
  g.rect(-5, -96, 10, 60).stroke(INNER);
  const leaf = shadeHex(t.wall, 0.05);
  const lobes: [number, number, number][] = [
    [8, -98, 26],
    [-9, -102, 24],
    [2, -112, 22],
  ];
  // Contorno de pegatina: la silueta de la copa en negro, 2 px más grande, debajo de los lóbulos
  for (const [x, y, r] of lobes) g.circle(x, y, r + 2).fill(LINE);
  g.circle(...lobes[0]).fill(shade(leaf, -0.18));
  g.circle(...lobes[1]).fill(leaf);
  g.circle(...lobes[2]).fill(leaf);
  g.circle(-8, -116, 10).fill(shade(leaf, 0.12));
}

function drawGarden(c: ShellCtx): void {
  const { g, t, W, H } = c;
  const soil = hex(t.trim);
  slab(c, soil, shade(soil, 0.12));
  // Piedrecitas en la tierra y labio de césped arriba
  for (let k = 0; k < W + H; k++) {
    const onRight = k < H;
    const pos = onRight ? k + 0.5 : k - H + 0.5;
    const s = onRight ? P(W, pos, -4 - 4 * cellHash(k, 0, 31)) : P(pos, H, -4 - 4 * cellHash(k, 0, 31));
    if (cellHash(k, 1, 32) < 0.5) g.ellipse(s[0], s[1], 2.4, 1.2).fill(shade(soil, -0.25));
  }
  slabStrip(c, 0, -3, shadeHex(t.floorAlt, -0.18), hex(t.floorAlt));

  drawTree(c);
  drawHedge(c, 0);
  drawHedge(c, 1);
  drawFence(c, 0);
  drawFence(c, 1);

  // Césped sin damero: dos verdes casi iguales repartidos por hash
  floorCells(c, (x, y) => (cellHash(x, y, 1) < 0.5 ? hex(t.floor) : shadeHex(t.floor, -0.035)));

  // Camino de losas de piedra desde el borde delantero hacia el fondo
  for (let i = 0; i < 9; i++) {
    const gx = W * 0.3 + i * 0.55 + (cellHash(i, 0, 41) - 0.5) * 0.3;
    const gy = H - 0.6 - i * 1.1;
    if (gy < 0.8) break;
    const s = toScreen(gx, gy);
    const rx = 7 + 3 * cellHash(i, 1, 42);
    g.ellipse(s.x, s.y + 1.5, rx, rx / 2).fill(shade(STONE, -0.18));
    g.ellipse(s.x, s.y, rx, rx / 2).fill(STONE).stroke(INNER);
  }

  // Matas y florecillas
  const blade = shadeHex(t.floorAlt, -0.18);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const h = cellHash(x, y, 7);
      if (h >= 0.26) continue;
      const s = toScreen(x + 0.25 + 0.5 * cellHash(x, y, 8), y + 0.25 + 0.5 * cellHash(x, y, 9));
      if (h < 0.17) {
        line(g, [s.x - 3, s.y - 5, s.x - 1, s.y], 1.5, blade);
        line(g, [s.x, s.y - 7, s.x, s.y], 1.5, blade);
        line(g, [s.x + 3, s.y - 5, s.x + 1, s.y], 1.5, blade);
      } else {
        const color = FLOWERS[Math.floor(cellHash(x, y, 10) * FLOWERS.length)];
        line(g, [s.x, s.y, s.x, s.y - 5], 1.2, blade);
        for (const [dx, dy] of [
          [-2, 0],
          [2, 0],
          [0, -1.6],
          [0, 1.6],
        ]) {
          g.circle(s.x + dx, s.y - 6 + dy, 1.7).fill(color);
        }
        g.circle(s.x, s.y - 6, 1.1).fill(0xf4a52a);
      }
    }
  }

  const sun = toScreen(W * 0.6, H * 0.45);
  g.ellipse(sun.x, sun.y, 95, 47).fill({ color: hex(t.light), alpha: 0.22 });
  floorBorder(c);
}

// ───────────────────────── Santuario (templo de meditación) ─────────────────────────
// wall/wallShade: papel shōji · floor/floorAlt: tatami · trim: laca roja de pilares y viga ·
// sky: atardecer de la ventana redonda · light: luz cálida.

const WOOD = 0x5a3a22;
const WOOD_L = 0x9a6a3e;
const HERI = 0x3b4a2a;
const STRAW = 0xd9b866;
const BEAM0 = WALL_H - 16;
const BEAM1 = WALL_H - 7;

function drawShoji(c: ShellCtx, side: 0 | 1, skip: [number, number] | null): void {
  const { g, W, H } = c;
  const len = side === 0 ? H : W;
  const at = (pos: number, z: number) => (side === 0 ? P(0, pos, z) : P(pos, 0, z));
  const alpha = side === 0 ? 0.7 : 0.8;
  const z0 = 10;
  const z1 = BEAM0;
  for (let p0 = 0; p0 < len; p0 += 2) {
    const p1 = Math.min(len, p0 + 2);
    if (skip && p1 > skip[0] && p0 < skip[1]) continue; // tramo de pared lisa (ventana)
    for (let p = p0 + 0.5; p < p1 - 0.01; p += 0.5) line(g, [...at(p, z0), ...at(p, z1)], 1, WOOD, alpha);
    for (let z = z0 + 13; z < z1 - 4; z += 13) line(g, [...at(p0, z), ...at(p1, z)], 1, WOOD, alpha);
  }
  for (let p = 0; p <= len; p += 2) line(g, [...at(p, z0), ...at(p, z1)], 2.5, WOOD);
}

function drawTatami(c: ShellCtx): void {
  const { g, t, W, H } = c;
  const edge = shadeHex(t.floorAlt, -0.25);
  for (let bx = 0; bx < W; bx += 2) {
    for (let by = 0; by < H; by += 2) {
      const horiz = (bx / 2 + by / 2) % 2 === 0;
      const mats: [number, number, number, number][] = horiz
        ? [
            [bx, by, 2, 1],
            [bx, by + 1, 2, 1],
          ]
        : [
            [bx, by, 1, 2],
            [bx + 1, by, 1, 2],
          ];
      for (const [mx, my, w0, h0] of mats) {
        const mw = Math.min(w0, W - mx);
        const mh = Math.min(h0, H - my);
        if (mw <= 0 || mh <= 0) continue;
        const fill = cellHash(mx, my, 3) < 0.5 ? hex(t.floor) : shadeHex(t.floor, 0.05);
        g.poly([...P(mx, my), ...P(mx + mw, my), ...P(mx + mw, my + mh), ...P(mx, my + mh)]).fill(fill);
        const alongX = mw >= mh;
        // Trama de la paja, a lo largo de la estera
        for (let k = 1; k < 4; k++) {
          const f = k / 4;
          if (alongX) line(g, [...P(mx, my + f * mh), ...P(mx + mw, my + f * mh)], 1, hex(t.floorAlt), 0.45);
          else line(g, [...P(mx + f * mw, my), ...P(mx + f * mw, my + mh)], 1, hex(t.floorAlt), 0.45);
        }
        // Bordes cortos finos y bordes largos (heri) oscuros
        if (alongX) {
          line(g, [...P(mx, my), ...P(mx, my + mh)], 1, edge, 0.6);
          line(g, [...P(mx + mw, my), ...P(mx + mw, my + mh)], 1, edge, 0.6);
          line(g, [...P(mx, my), ...P(mx + mw, my)], 2.5, HERI);
          line(g, [...P(mx, my + mh), ...P(mx + mw, my + mh)], 2.5, HERI);
        } else {
          line(g, [...P(mx, my), ...P(mx + mw, my)], 1, edge, 0.6);
          line(g, [...P(mx, my + mh), ...P(mx + mw, my + mh)], 1, edge, 0.6);
          line(g, [...P(mx, my), ...P(mx, my + mh)], 2.5, HERI);
          line(g, [...P(mx + mw, my), ...P(mx + mw, my + mh)], 2.5, HERI);
        }
      }
    }
  }
}

function drawMoonWindow(c: ShellCtx, cx: number, cz: number, r: number): void {
  const { g, t } = c;
  const sky = hex(t.sky);
  g.poly(rightWallArc(cx, cz, r, 0, Math.PI * 2, 40)).fill(sky);
  const sun = toScreen(cx + 0.25, 0, cz + 4);
  g.circle(sun.x, sun.y, 6.5).fill(shadeHex(t.light, 0.3));
  // Montañas: arco inferior de izquierda a derecha y cumbres de vuelta
  const lower = rightWallArc(cx, cz, r, Math.PI + 0.42, Math.PI * 2 - 0.42, 16);
  const peaks = [...P(cx + 0.55, 0, cz + 1), ...P(cx + 0.15, 0, cz - 5), ...P(cx - 0.35, 0, cz + 7)];
  g.poly([...lower, ...peaks]).fill(shade(sky, -0.28));
  // Celosía de bambú
  for (const dx of [-0.42, 0.42]) {
    const half = r * CELL_PX * Math.sqrt(1 - (dx / r) ** 2);
    line(g, [...P(cx + dx, 0, cz - half), ...P(cx + dx, 0, cz + half)], 2, WOOD);
  }
  g.poly(rightWallArc(cx, cz, r, 0, Math.PI * 2, 40)).stroke({ width: 4, color: WOOD });
  g.poly(rightWallArc(cx, cz, r + 0.12, 0, Math.PI * 2, 40)).stroke({ width: 1.5, color: LINE, alpha: 0.8 });
}

function drawShimenawa(c: ShellCtx, y0: number, y1: number): void {
  const { g } = c;
  const z0 = BEAM0 - 1;
  const rope: number[] = [];
  const at = (f: number) => P(0, y0 + (y1 - y0) * f, z0 - 12 * Math.sin(Math.PI * f));
  for (let i = 0; i <= 16; i++) rope.push(...at(i / 16));
  line(g, rope, 6.5, LINE);
  line(g, rope, 4, STRAW);
  // Tiras de papel shide en zigzag
  for (const f of [0.25, 0.5, 0.75]) {
    const [sx, sy] = at(f);
    for (let k = 0; k < 4; k++) {
      g.rect(sx - 2 + (k % 2) * 2, sy + 2 + k * 4, 4, 4).fill(0xffffff).stroke({ width: 1, color: LINE, alpha: 0.6 });
    }
  }
}

function drawShrine(c: ShellCtx): void {
  const { g, t, W, H } = c;
  const red = hex(t.trim);
  slab(c, shade(WOOD_L, -0.18), WOOD_L);
  // Tablas de la tarima (engawa)
  for (let y = 1; y < H; y++) line(g, [...P(W, y), ...P(W, y, -SLAB)], 1, WOOD, 0.5);
  for (let x = 1; x < W; x++) line(g, [...P(x, H), ...P(x, H, -SLAB)], 1, WOOD, 0.5);

  walls(c, hex(t.wall), hex(t.wallShade));
  const winX = W * 0.75;
  const winR = 1.25;
  drawShoji(c, 0, null);
  drawShoji(c, 1, [winX - winR - 0.1, winX + winR + 0.1]);
  band(c, 0, 10, WOOD, shade(WOOD, -0.18)); // zócalo de madera (koshi-ita)
  band(c, BEAM0, BEAM1, red, shade(red, -0.18)); // viga lacada
  band(c, BEAM1, WALL_H, WOOD, shade(WOOD, -0.18));
  line(g, [...P(0, H, BEAM0), ...P(0, 0, BEAM0), ...P(W, 0, BEAM0)], 1.5, LINE, 0.6);
  drawMoonWindow(c, winX, 47, winR);

  drawTatami(c);
  const glow = toScreen(winX + 0.4, 2.6);
  g.ellipse(glow.x, glow.y, 62, 31).fill({ color: hex(t.light), alpha: 0.3 });

  // Pilares lacados: esquina, extremos y mitad de cada pared (encima del suelo)
  const s = 0.3;
  for (const [px, py] of [
    [0, 0],
    [0, H / 2 - s / 2],
    [0, H - s],
    [W / 2 - s / 2, 0],
    [W - s, 0],
  ]) {
    pillar(c, px, py, s, 0, BEAM0, red);
  }
  drawShimenawa(c, 0.7, H / 2 - 0.4);
  floorBorder(c);
  wallOutline(c);
}

// ───────────────────────── Cita Final (sala celeste legendaria) ─────────────────────────
// wall/wallShade: cielo nocturno de las paredes · floor/floorAlt: mármol · trim: oro ·
// sky: interior del portal · light: luz de luna (cristales, estrellas grandes y reflejo).

const STAR = 0xfff8e6;

interface WallStar {
  x: number;
  y: number;
  r: number;
  big: boolean;
  phase: number;
}

function portalOf(W: number) {
  return { cx: W * 0.62, hw: 1.2, z0: 22, zs: 50 };
}

/** Estrellas de las paredes (las mismas para el dibujo fijo y para la capa que titila). */
function celestialStars(W: number, H: number): WallStar[] {
  const out: WallStar[] = [];
  const portal = portalOf(W);
  for (const side of [0, 1]) {
    const len = side === 0 ? H : W;
    for (let i = 0; i < len * 3; i++) {
      const pos = 0.3 + cellHash(i, side, 11) * (len - 0.6);
      const z = 14 + cellHash(i, side, 12) * (WALL_H - 30);
      if (side === 1 && Math.abs(pos - portal.cx) < portal.hw + 0.35) continue;
      const k = cellHash(i, side, 13);
      const [x, y] = side === 0 ? P(0, pos, z) : P(pos, 0, z);
      out.push({ x, y, r: 0.8 + k * 0.7, big: k > 0.82, phase: cellHash(i, side, 14) * Math.PI * 2 });
    }
  }
  return out;
}

function drawPortal(c: ShellCtx): void {
  const { g, t, W } = c;
  const { cx, hw, z0, zs } = portalOf(W);
  const shape = [...P(cx - hw, 0, z0), ...P(cx + hw, 0, z0), ...rightWallArc(cx, zs, hw, 0, Math.PI, 20)];
  g.poly(shape).fill(hex(t.sky));
  const mid = toScreen(cx, 0, 38);
  g.ellipse(mid.x - 4, mid.y + 2, 13, 5).fill({ color: 0x5b3fb8, alpha: 0.85 });
  g.ellipse(mid.x + 5, mid.y - 4, 9, 3.5).fill({ color: 0xa35ad0, alpha: 0.7 });
  g.ellipse(mid.x + 1, mid.y - 1, 5, 2).fill({ color: 0xe39ae8, alpha: 0.6 });
  const moon = toScreen(cx + 0.3, 0, 60);
  g.circle(moon.x, moon.y, 7).fill(hex(t.light));
  g.circle(moon.x + 3, moon.y - 2, 6).fill(hex(t.sky));
  for (const [dx, dz] of [
    [-0.6, 56],
    [-0.2, 66],
    [0.7, 44],
    [-0.75, 30],
  ]) {
    const s = toScreen(cx + dx, 0, dz);
    g.circle(s.x, s.y, 0.9).fill(STAR);
  }
  g.poly(shape).stroke({ width: 4, color: hex(t.trim) });
  g.poly(shape).stroke({ width: 1.5, color: LINE, alpha: 0.8 });
}

function drawCelestial(c: ShellCtx): void {
  const { g, t, W, H } = c;
  const gold = hex(t.trim);
  const moon = hex(t.light);

  // Losa flotante con filo dorado y cristales colgando
  const stone = shadeHex(t.floorAlt, -0.4);
  slab(c, shade(stone, -0.18), stone);
  slabStrip(c, 0, -2.5, shade(gold, -0.18), gold);
  const crystals: [number, number, number][] = [
    [W * 0.22, H, 1],
    [W * 0.58, H, 0.8],
    [W, H * 0.3, 0.85],
    [W, H * 0.72, 1.05],
  ];
  for (const [gx, gy, k] of crystals) {
    const s = toScreen(gx, gy, -SLAB);
    const w = 7 * k;
    const d = 15 * k;
    g.poly([s.x - w, s.y, s.x, s.y + 2, s.x, s.y + d]).fill(moon).stroke({ width: 1.5, color: LINE });
    g.poly([s.x, s.y + 2, s.x + w, s.y, s.x, s.y + d]).fill(shade(moon, -0.18)).stroke({ width: 1.5, color: LINE });
  }

  walls(c, hex(t.wall), hex(t.wallShade));
  for (const st of celestialStars(W, H)) {
    if (st.big) sparkle(g, st.x, st.y, 3.5, moon, 0.9);
    else g.circle(st.x, st.y, st.r).fill({ color: STAR, alpha: 0.5 + st.r * 0.3 });
  }
  drawPortal(c);
  band(c, 0, 7, gold, shade(gold, -0.18));
  band(c, WALL_H - 7, WALL_H, gold, shade(gold, -0.18));
  for (const z of [10, WALL_H - 10]) line(g, [...P(0, H, z), ...P(0, 0, z), ...P(W, 0, z)], 1, gold, 0.6);

  // Mármol con juntas doradas y vetas
  floorCells(c, (x, y) => ((x + y) % 2 === 1 ? hex(t.floorAlt) : hex(t.floor)));
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const h = cellHash(x, y, 51);
      if (h > 0.3) continue;
      line(g, [...P(x + 0.15, y + 0.3 + h), ...P(x + 0.5, y + 0.5), ...P(x + 0.85, y + 0.2 + h)], 1, 0xffffff, 0.2);
    }
  }
  for (let x = 1; x < W; x++) line(g, [...P(x, 0), ...P(x, H)], 1, gold, 0.5);
  for (let y = 1; y < H; y++) line(g, [...P(0, y), ...P(W, y)], 1, gold, 0.5);

  // Círculo rúnico en el centro
  const cx = W / 2;
  const cy = H / 2;
  g.poly(floorRing(cx, cy, 2.4)).stroke({ width: 1.5, color: gold, alpha: 0.6 });
  g.poly(floorRing(cx, cy, 2.0)).stroke({ width: 1, color: gold, alpha: 0.5 });
  const star: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    star.push(...P(cx + 2 * Math.cos(a), cy + 2 * Math.sin(a)));
  }
  g.poly(star).stroke({ width: 1, color: gold, alpha: 0.45 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = toScreen(cx + 2.4 * Math.cos(a), cy + 2.4 * Math.sin(a));
    g.ellipse(s.x, s.y, 2.6, 1.3).fill({ color: gold, alpha: 0.85 });
  }

  const glow = toScreen(portalOf(W).cx + 0.8, 2.4);
  g.ellipse(glow.x, glow.y, 64, 32).fill({ color: moon, alpha: 0.2 });

  // Columnas doradas con basa y capitel
  const s = 0.34;
  for (const [px, py] of [
    [0, 0],
    [0, H - s],
    [W - s, 0],
  ]) {
    pillar(c, px, py, s, 0, WALL_H - 7, shade(gold, 0.08));
    pillar(c, px - 0.04, py - 0.04, s + 0.08, 0, 7, gold);
    pillar(c, px - 0.04, py - 0.04, s + 0.08, WALL_H - 18, WALL_H - 10, gold);
  }
  floorBorder(c);
  wallOutline(c);
}

// ───────────────────────── Registro ─────────────────────────

const STYLES: Record<StyleId, RoomStyle> = {
  interior: { id: 'interior', topExtra: 0, bottomExtra: 0, draw: drawInterior },
  garden: { id: 'garden', topExtra: 42, bottomExtra: 0, exterior: true, draw: drawGarden },
  shrine: { id: 'shrine', topExtra: 0, bottomExtra: 0, draw: drawShrine },
  celestial: {
    id: 'celestial',
    topExtra: 0,
    bottomExtra: 18,
    ownSky: true,
    draw: drawCelestial,
    twinkles: (W, H) =>
      celestialStars(W, H)
        .filter((s) => s.big || s.r > 1.3)
        .map((s) => ({ x: s.x, y: s.y, size: s.big ? 5 : 3, phase: s.phase })),
  },
};
