/**
 * Carcasa de cada sala del hábitat (paredes, suelo, losa y su elemento característico).
 *
 * Cada sala tiene su propia arquitectura, elegida por el id de la sala (`styleFor`), y su propia
 * forma: las celdas sin suelo (`blocked` en habitats.json, aquí `holes`) se dibujan por debajo
 * del nivel del suelo. Un hueco encerrado por suelo es un foso (estanque) y uno que da al borde
 * delantero es un desnivel (escalón de entrada, jardín seco) o, sin fondo, el vacío. Nada de la
 * carcasa sube por encima del suelo dentro de la zona pisable: la carcasa se pinta debajo del
 * Pockai y los muebles, así que lo alto taparía mal.
 *
 * Los colores siguen saliendo de `theme` en habitats.json; cada estilo interpreta las 7 claves a
 * su manera (ver el comentario de cada uno). Las dos paredes del fondo (x = 0, y = 0) existen
 * siempre: los huecos no pueden tocarlas.
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
/** Grosor de las paredes (en celdas): se ve en el canto de arriba y en los extremos. */
export const WALL_T = 0.35;
/** Largo en pantalla de una celda a lo largo de un eje (√(16² + 8²)): para círculos en una pared. */
const CELL_PX = 17.9;

export type StyleId = 'interior' | 'garden' | 'shrine' | 'celestial';

export interface ShellCtx {
  g: Graphics;
  t: RoomTheme;
  W: number;
  H: number;
  /** Celdas `"x,y"` sin suelo (forma de la sala). */
  holes: Set<string>;
}

/** Estrella o destello que titila (capa ambiental, en píxeles de la sala). */
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
  twinkles?(W: number, H: number, holes: Set<string>): Twinkle[];
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

/** Cuadrilátero de una celda (o de un trozo) del suelo a la altura `z`. */
const quad = (x0: number, y0: number, x1: number, y1: number, z = 0) => [
  ...P(x0, y0, z),
  ...P(x1, y0, z),
  ...P(x1, y1, z),
  ...P(x0, y1, z),
];

const INNER = { width: 1.5, color: LINE, alpha: 0.6 } as const;

function line(g: Graphics, pts: number[], width: number, color: number, alpha = 1): void {
  g.poly(pts, false).stroke({ width, color, alpha });
}

const inGrid = (c: ShellCtx, x: number, y: number) => x >= 0 && y >= 0 && x < c.W && y < c.H;
export const isFloor = (c: ShellCtx, x: number, y: number) => inGrid(c, x, y) && !c.holes.has(`${x},${y}`);

/** Celdas en orden de pintado (de la del fondo a la más cercana). */
function cellsByDepth(c: ShellCtx): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d <= c.W + c.H - 2; d++) {
    for (let x = Math.max(0, d - c.H + 1); x <= Math.min(c.W - 1, d); x++) out.push([x, d - x]);
  }
  return out;
}

/** Huecos unidos al borde delantero (desnivel o vacío); el resto son fosos rodeados de suelo. */
export function openHoles(W: number, H: number, holes: Set<string>): Set<string> {
  const open = new Set<string>();
  const queue: [number, number][] = [];
  for (const k of holes) {
    const [x, y] = k.split(',').map(Number);
    if (x === W - 1 || y === H - 1) {
      open.add(k);
      queue.push([x, y]);
    }
  }
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const k = `${nx},${ny}`;
      if (holes.has(k) && !open.has(k)) {
        open.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return open;
}

/** Bajada de un hueco: su profundidad, el color de su fondo y el de las paredes que lo rodean. */
interface Level {
  depth: number;
  top: (x: number, y: number) => number;
  /** Cara que mira a +x (en sombra) y a +y (iluminada). */
  right: number;
  left: number;
}

/** Cara vertical expuesta (de la losa o de un desnivel), en coordenadas de rejilla. */
export interface Face {
  /** Celda a la que pertenece y lado: 'R' mira a +x, 'L' mira a +y. */
  x: number;
  y: number;
  side: 'R' | 'L';
  /** Arista superior, de (x0, y0) a (x1, y1). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
  /** Da al exterior de la sala (o al vacío), no a un hueco con fondo. */
  outer: boolean;
  /** Es la cara del propio hueco (de su fondo hacia abajo), no la del suelo. */
  ofHole: boolean;
}

interface GroundSpec {
  /** Colores de la losa exterior. */
  right: number;
  left: number;
  /** Fosos (huecos rodeados de suelo). */
  pit?: Level;
  /** Huecos que dan al borde; sin él son vacío (la losa baja entera). */
  open?: Level | null;
  /** Detalle de cada cara (labio de césped, filo dorado, cristales…), justo después de pintarla. */
  decor?: (f: Face) => void;
}

const facePts = (f: Face) => [...P(f.x0, f.y0, f.z0), ...P(f.x1, f.y1, f.z0), ...P(f.x1, f.y1, f.z1), ...P(f.x0, f.y0, f.z1)];

/**
 * Suelo con forma: fondos de los huecos, caras de la losa en cada arista expuesta (también las de
 * los huecos) y, encima, nada más. Las tapas las pinta cada estilo después (`floorCells`), así
 * tapan lo que cuelga de las celdas de detrás.
 */
function ground(c: ShellCtx, spec: GroundSpec): void {
  const { g, W, H, holes } = c;
  const open = openHoles(W, H, holes);
  const levelOf = (x: number, y: number): Level | null =>
    open.has(`${x},${y}`) ? (spec.open ?? null) : (spec.pit ?? spec.open ?? null);
  const order = cellsByDepth(c);
  const paint = (f: Face, right: number, left: number) => {
    g.poly(facePts(f))
      .fill(f.side === 'R' ? right : left)
      .stroke(f.outer ? { width: 2, color: LINE } : INNER);
    spec.decor?.(f);
  };
  const edges = (x: number, y: number): ['R' | 'L', number, number, number, number, number, number][] => [
    ['R', x + 1, y, x + 1, y, x + 1, y + 1],
    ['L', x, y + 1, x, y + 1, x + 1, y + 1],
  ];

  // 1. Fondos de los huecos y sus propias caras hacia el exterior
  for (const [x, y] of order) {
    if (!holes.has(`${x},${y}`)) continue;
    const lv = levelOf(x, y);
    if (!lv) continue;
    g.poly(quad(x, y, x + 1, y + 1, -lv.depth)).fill(lv.top(x, y));
    for (const [side, nx, ny, x0, y0, x1, y1] of edges(x, y)) {
      if (inGrid(c, nx, ny)) continue;
      paint({ x, y, side, x0, y0, x1, y1, z0: -lv.depth, z1: -SLAB, outer: true, ofHole: true }, spec.right, spec.left);
    }
  }
  // 2. Caras del suelo en cada arista expuesta
  for (const [x, y] of order) {
    if (holes.has(`${x},${y}`)) continue;
    for (const [side, nx, ny, x0, y0, x1, y1] of edges(x, y)) {
      if (isFloor(c, nx, ny)) continue;
      const lv = inGrid(c, nx, ny) ? levelOf(nx, ny) : null;
      const f: Face = { x, y, side, x0, y0, x1, y1, z0: 0, z1: -(lv ? lv.depth : SLAB), outer: !lv, ofHole: false };
      paint(f, lv ? lv.right : spec.right, lv ? lv.left : spec.left);
    }
  }
}

/** Tapa de cada celda con suelo. */
function floorCells(c: ShellCtx, color: (x: number, y: number) => number): void {
  const { g, W, H } = c;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (isFloor(c, x, y)) g.poly(quad(x, y, x + 1, y + 1)).fill(color(x, y));
    }
  }
}

/** Contorno del suelo: aristas entre suelo y no-suelo (el borde de fuera, más grueso). */
function floorBorder(c: ShellCtx): void {
  const { g, W, H } = c;
  const open = openHoles(W, H, c.holes);
  const edgeOf = (x: number, y: number) => !inGrid(c, x, y) || open.has(`${x},${y}`);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (!isFloor(c, x, y)) continue;
      const sides: [number, number, number[]][] = [
        [x + 1, y, [...P(x + 1, y), ...P(x + 1, y + 1)]],
        [x, y + 1, [...P(x, y + 1), ...P(x + 1, y + 1)]],
        [x - 1, y, [...P(x, y), ...P(x, y + 1)]],
        [x, y - 1, [...P(x, y), ...P(x + 1, y)]],
      ];
      for (const [nx, ny, pts] of sides) {
        if (isFloor(c, nx, ny)) continue;
        line(g, pts, edgeOf(nx, ny) ? 2 : 1.5, LINE, edgeOf(nx, ny) ? 1 : 0.85);
      }
    }
  }
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

/** Línea horizontal a lo largo de las dos paredes. */
function wallLine(c: ShellCtx, z: number, width: number, color: number, alpha = 1): void {
  line(c.g, [...P(0, c.H, z), ...P(0, 0, z), ...P(c.W, 0, z)], width, color, alpha);
}

/** Contorno abierto de las paredes (sin cerrar: si no, cruzaría el suelo en diagonal). */
function wallOutline(c: ShellCtx, h = WALL_H): void {
  const { g, W, H } = c;
  line(g, [...P(0, H), ...P(0, H, h), ...P(0, 0, h), ...P(W, 0, h), ...P(W, 0)], 2, LINE);
  line(g, [...P(0, 0), ...P(0, 0, h)], 1.5, LINE, 0.6);
}

/**
 * Grosor de las paredes: canto superior en L y los dos extremos (que bajan hasta el fondo de la
 * losa). Es lo que hace que la sala deje de parecer un decorado de cartón.
 */
function wallThickness(c: ShellCtx, cap: number, body: number, h = WALL_H): void {
  const { g, W, H } = c;
  const T = WALL_T;
  g.poly([...P(0, 0, h), ...P(0, H, h), ...P(-T, H, h), ...P(-T, -T, h), ...P(W, -T, h), ...P(W, 0, h)])
    .fill(cap)
    .stroke({ width: 2, color: LINE });
  line(g, [...P(0, H, h), ...P(0, 0, h), ...P(W, 0, h)], 1, LINE, 0.45);
  g.poly([...P(0, H, -SLAB), ...P(0, H, h), ...P(-T, H, h), ...P(-T, H, -SLAB)])
    .fill(body)
    .stroke({ width: 2, color: LINE });
  g.poly([...P(W, 0, -SLAB), ...P(W, 0, h), ...P(W, -T, h), ...P(W, -T, -SLAB)])
    .fill(shade(body, -0.18))
    .stroke({ width: 2, color: LINE });
}

/** Sombra de contacto en la unión pared-suelo (oclusión ambiental en dos pasos). */
function contactShadow(c: ShellCtx, alpha = 0.13): void {
  const { g, W, H } = c;
  for (const [w, a] of [
    [0.55, alpha * 0.55],
    [0.25, alpha],
  ]) {
    g.poly([...P(0, 0), ...P(W, 0), ...P(W, w), ...P(w, w)]).fill({ color: LINE, alpha: a });
    g.poly([...P(0, 0), ...P(0, H), ...P(w, H), ...P(w, w)]).fill({ color: LINE, alpha: a * 0.8 });
  }
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

/** Punto de una pared: lado 0 = izquierda (x = 0), lado 1 = derecha (y = 0). */
const onWall = (side: 0 | 1, pos: number, z: number, out = 0) => (side === 0 ? P(out, pos, z) : P(pos, out, z));

/** Puntos de un arco en la pared derecha (plano y = 0), con radio `r` en celdas. */
function rightWallArc(cx: number, cz: number, r: number, from: number, to: number, n = 32): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push(...P(cx + r * Math.cos(a), 0, cz + r * CELL_PX * Math.sin(a)));
  }
  return pts;
}

/** Puntos de un círculo en el suelo (radio en celdas), a la altura `z`. */
function floorRing(cx: number, cy: number, r: number, n = 40, z = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(...P(cx + r * Math.cos(a), cy + r * Math.sin(a), z));
  }
  return pts;
}

/** Rectángulo que envuelve un conjunto de celdas. */
function boxOf(cells: Iterable<string>): { x0: number; y0: number; x1: number; y1: number } | null {
  let b: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (!b) b = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
    else b = { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x + 1), y1: Math.max(b.y1, y + 1) };
  }
  return b;
}

/** Destello de cuatro puntas. */
export function sparkle(g: Graphics, x: number, y: number, s: number, color: number, alpha = 1): void {
  const k = s * 0.28;
  g.poly([x, y - s, x + k, y - k, x + s, y, x + k, y + k, x, y + s, x - k, y + k, x - s, y, x - k, y - k]).fill({
    color,
    alpha,
  });
}

// ───────────────────────── Sala principal (interior clásico, en L) ─────────────────────────
// wall/wallShade: paredes · floor: parqué · trim: zócalo, molduras, losa y marcos · sky: ventanas ·
// light: luz. La esquina delantera que falta es un recibidor un escalón más bajo.

const ENTRY = 5;
const TILE = 0xd8cdb8;
const MAT = 0xb5533c;
const CURTAIN = 0xe9876b;
const POT = 0xc4693a;
const LEAF = 0x5aa65a;

/** Ventana con alféizar y cortinas en una pared, entre `p0` y `p1` (celdas) y `z0`–`z1`. */
function windowOn(c: ShellCtx, side: 0 | 1, p0: number, p1: number, z0: number, z1: number): void {
  const { g, t } = c;
  const trim = hex(t.trim);
  const at = (p: number, z: number, out = 0) => onWall(side, p, z, out);
  g.poly([...at(p0, z1), ...at(p1, z1), ...at(p1, z0), ...at(p0, z0)])
    .fill(hex(t.sky))
    .stroke({ width: 3, color: trim });
  // Reflejo diagonal en el cristal
  const m = (p0 + p1) / 2;
  g.poly([...at(p0 + 0.2, z1 - 4), ...at(p0 + 0.55, z1 - 4), ...at(p0 + 0.35, z0 + 6), ...at(p0 + 0.2, z0 + 6)]).fill({
    color: 0xffffff,
    alpha: 0.35,
  });
  line(g, [...at(m, z1), ...at(m, z0)], 2, trim);
  line(g, [...at(p0, (z0 + z1) / 2), ...at(p1, (z0 + z1) / 2)], 2, trim);
  // Alféizar que sobresale
  g.poly([...at(p0 - 0.2, z0), ...at(p1 + 0.2, z0), ...at(p1 + 0.2, z0, 0.3), ...at(p0 - 0.2, z0, 0.3)])
    .fill(shade(trim, 0.25))
    .stroke(INNER);
  g.poly([...at(p0 - 0.2, z0, 0.3), ...at(p1 + 0.2, z0, 0.3), ...at(p1 + 0.2, z0 - 3, 0.3), ...at(p0 - 0.2, z0 - 3, 0.3)])
    .fill(shade(trim, -0.1))
    .stroke(INNER);
  // Cortinas recogidas a los lados y barra
  const cur = side === 0 ? CURTAIN : shade(CURTAIN, -0.18);
  for (const [a, b] of [
    [p0 - 0.45, p0 + 0.05],
    [p1 - 0.05, p1 + 0.45],
  ]) {
    const mid = (a + b) / 2;
    g.poly([...at(a, z1 + 5), ...at(b, z1 + 5), ...at(mid + 0.08, z0 + 12), ...at(b - 0.05, z0 - 4), ...at(a + 0.05, z0 - 4), ...at(mid - 0.08, z0 + 12)])
      .fill(cur)
      .stroke({ width: 1.5, color: LINE, alpha: 0.8 });
    line(g, [...at(mid, z1 + 4), ...at(mid, z0 + 14)], 1, shade(cur, -0.2), 0.7);
  }
  line(g, [...at(p0 - 0.6, z1 + 6), ...at(p1 + 0.6, z1 + 6)], 2.5, shade(trim, -0.2));
}

/** Rayo de luz que entra por una ventana y cae en el suelo. */
function lightPatch(c: ShellCtx, side: 0 | 1, p0: number, p1: number): void {
  const { g, t } = c;
  const pts =
    side === 1
      ? [...P(p0 + 0.7, 0.5), ...P(p1 + 0.7, 0.5), ...P(p1 + 1.6, 3.4), ...P(p0 + 1.6, 3.4)]
      : [...P(0.5, p0 + 0.7), ...P(0.5, p1 + 0.7), ...P(3.4, p1 + 1.6), ...P(3.4, p0 + 1.6)];
  g.poly(pts).fill({ color: hex(t.light), alpha: 0.22 });
}

function drawInterior(c: ShellCtx): void {
  const { g, t, W, H, holes } = c;
  const trim = hex(t.trim);
  const wall = hex(t.wall);
  const wallR = hex(t.wallShade);
  const entry: Level = {
    depth: ENTRY,
    top: (x, y) => ((x + y) % 2 === 0 ? TILE : shade(TILE, -0.08)),
    right: shade(trim, -0.08),
    left: shade(trim, 0.12),
  };
  ground(c, { right: trim, left: shade(trim, 0.12), open: entry, pit: entry });

  walls(c, wall, wallR);
  // Papel pintado: rayas finas y florecillas en la parte alta
  for (const side of [0, 1] as const) {
    const len = side === 0 ? H : W;
    const base = side === 0 ? wall : wallR;
    for (let p = 0.25; p < len; p += 0.5) line(g, [...onWall(side, p, 38), ...onWall(side, p, WALL_H - 7)], 1, shade(base, -0.12), 0.5);
    for (let p = 0.5; p < len; p += 1) {
      for (const z of [50, 72]) {
        const [sx, sy] = onWall(side, p + (z === 72 ? 0.5 : 0), z);
        g.circle(sx, sy, 1.6).fill(shade(base, -0.16));
      }
    }
  }
  // Friso de madera con paneles, moldura de remate, zócalo y cornisa
  band(c, 8, 34, shade(wall, -0.1), shade(wallR, -0.1));
  for (const side of [0, 1] as const) {
    const len = side === 0 ? H : W;
    for (let p = 0.12; p + 0.76 <= len; p += 1) {
      g.poly([...onWall(side, p, 30), ...onWall(side, p + 0.76, 30), ...onWall(side, p + 0.76, 12), ...onWall(side, p, 12)]).stroke({
        width: 1,
        color: LINE,
        alpha: 0.28,
      });
    }
  }
  band(c, 34, 38, trim, shade(trim, -0.18));
  wallLine(c, 38, 1, shade(trim, 0.3), 0.8);
  band(c, 0, 8, trim, shade(trim, -0.18));
  wallLine(c, 8, 1, shade(trim, 0.3), 0.8);
  band(c, WALL_H - 6, WALL_H, shade(trim, 0.55), shade(trim, 0.4));
  wallLine(c, WALL_H - 6, 1, LINE, 0.4);

  // Ventanas (una en cada pared) y un cuadro
  const wx0 = W * 0.55;
  const wx1 = Math.min(W - 1, wx0 + 3);
  windowOn(c, 1, wx0, wx1, 44, 74);
  const ly0 = H * 0.3;
  const ly1 = ly0 + 2;
  windowOn(c, 0, ly0, ly1, 44, 74);
  const fy = H * 0.72;
  g.poly([...onWall(0, fy, 76), ...onWall(0, fy + 1.3, 76), ...onWall(0, fy + 1.3, 52), ...onWall(0, fy, 52)])
    .fill(shade(trim, -0.15))
    .stroke({ width: 1.5, color: LINE });
  g.poly([...onWall(0, fy + 0.15, 73), ...onWall(0, fy + 1.15, 73), ...onWall(0, fy + 1.15, 55), ...onWall(0, fy + 0.15, 55)]).fill(hex(t.sky));
  g.poly([...onWall(0, fy + 0.15, 55), ...onWall(0, fy + 0.5, 64), ...onWall(0, fy + 0.8, 58), ...onWall(0, fy + 1.15, 66), ...onWall(0, fy + 1.15, 55)]).fill(
    LEAF,
  );
  const sun = onWall(0, fy + 0.85, 68);
  g.circle(sun[0], sun[1], 2.2).fill(0xffd84d);

  // Parqué de tablas desalineadas (a lo largo de x, dos por celda)
  const floor = hex(t.floor);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (!isFloor(c, x, y)) continue;
      for (const half of [0, 1]) {
        const r = 2 * y + half;
        const k = Math.floor((x + (r % 3)) / 3);
        const y0 = y + half / 2;
        g.poly(quad(x, y0, x + 1, y0 + 0.5)).fill(shade(floor, (cellHash(k, r, 61) - 0.5) * 0.12));
        if ((x + (r % 3)) % 3 === 0) line(g, [...P(x, y0), ...P(x, y0 + 0.5)], 1, shade(floor, -0.3), 0.6);
      }
      line(g, [...P(x, y + 0.5), ...P(x + 1, y + 0.5)], 1, shade(floor, -0.25), 0.45);
      line(g, [...P(x, y + 1), ...P(x + 1, y + 1)], 1, shade(floor, -0.25), 0.45);
    }
  }
  lightPatch(c, 1, wx0, wx1);
  lightPatch(c, 0, ly0, ly1);
  contactShadow(c);

  // Recibidor: felpudo y una maceta baja en la esquina
  const box = boxOf(openHoles(W, H, holes));
  if (box) {
    const mx = (box.x0 + box.x1) / 2 - 0.3;
    const my = (box.y0 + box.y1) / 2;
    g.poly(quad(mx - 0.9, my - 0.6, mx + 0.9, my + 0.6, -ENTRY)).fill(MAT).stroke({ width: 1.5, color: LINE, alpha: 0.8 });
    g.poly(quad(mx - 0.7, my - 0.4, mx + 0.7, my + 0.4, -ENTRY)).stroke({ width: 1, color: shade(MAT, 0.35), alpha: 0.9 });
    for (let k = -0.8; k <= 0.8; k += 0.2) line(g, [...P(mx + k, my + 0.6, -ENTRY), ...P(mx + k, my + 0.75, -ENTRY)], 1, shade(MAT, 0.2));
    const pot = toScreen(box.x1 - 0.55, box.y1 - 0.55, -ENTRY);
    g.ellipse(pot.x, pot.y + 1, 7, 3.2).fill({ color: LINE, alpha: 0.2 });
    g.poly([pot.x - 6, pot.y - 9, pot.x + 6, pot.y - 9, pot.x + 4.5, pot.y, pot.x - 4.5, pot.y]).fill(POT).stroke({ width: 1.5, color: LINE });
    g.rect(pot.x - 7, pot.y - 11, 14, 3).fill(shade(POT, 0.15)).stroke({ width: 1.5, color: LINE });
    for (const [dx, dy, r, k] of [
      [-5, -15, 4.5, -0.18],
      [4, -16, 4.5, -0.1],
      [0, -20, 5, 0],
      [-2, -24, 3.5, 0.15],
    ]) {
      g.circle(pot.x + dx, pot.y + dy, r + 1.5).fill(LINE);
      g.circle(pot.x + dx, pot.y + dy, r).fill(shade(LEAF, k));
    }
  }

  floorBorder(c);
  wallOutline(c);
  wallThickness(c, shade(trim, 0.5), shade(wall, -0.06));
}

// ───────────────────────── Jardín (exterior, con estanque) ─────────────────────────
// wall: seto · wallShade: valla · floor/floorAlt: césped · trim: tierra de la losa · sky: sin uso
// (el cielo es el fondo) · light: sol. El hueco interior es un estanque; los del borde, mordiscos
// del terreno.

const HEDGE = 56;
const FENCE = 32;
const TRUNK = 0x8a5a35;
const STONE = 0xd6cfbf;
const WATER = 0x58b9de;
const PAD = 0x4f9e4a;
const POND = 7;
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
  const at = (pos: number, z: number) => onWall(side, pos, z);
  const base = side === 0 ? hex(t.wall) : shadeHex(t.wall, -0.18);
  const top: number[] = [];
  const steps = len * 6;
  for (let i = 0; i <= steps; i++) {
    const pos = (i / steps) * len;
    top.push(...at(pos, hedgeZ(Math.min(pos, len - 1e-6), side)));
  }
  g.poly([...at(0, 0), ...top, ...at(len, 0)]).fill(base);
  // Volumen: base en sombra y franja de luz bajo los bultos
  g.poly([...at(0, 0), ...at(len, 0), ...at(len, 12), ...at(0, 12)]).fill(shade(base, -0.2));
  for (let k = 0; k < len; k++) {
    for (let j = 0; j < 2; j++) {
      const p = k + 0.25 + 0.5 * j;
      const hl = at(p, HEDGE - 6 - 10 * cellHash(k, j, 22 + side));
      g.ellipse(hl[0], hl[1], 5, 3).fill(shade(base, 0.12));
      const dk = at(p + 0.2, 16 + 18 * cellHash(k, j, 24 + side));
      g.ellipse(dk[0], dk[1], 4, 2.5).fill(shade(base, -0.12));
    }
    // Bayas sueltas
    if (cellHash(k, side, 26) < 0.35) {
      const b = at(k + 0.5, 30 + 16 * cellHash(k, side, 27));
      g.circle(b[0], b[1], 1.6).fill(0xe2445c);
    }
  }
  line(g, top, 2, LINE);
}

function drawFence(c: ShellCtx, side: 0 | 1): void {
  const { g, t, W, H } = c;
  const len = side === 0 ? H : W;
  const at = (pos: number, z: number) => onWall(side, pos, z);
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
  for (const [x, y] of [
    [14, -104],
    [-14, -96],
    [4, -122],
  ]) {
    g.circle(x, y, 2.4).fill(0xff8fb1);
  }
}

function drawGarden(c: ShellCtx): void {
  const { g, t, W, H, holes } = c;
  const soil = hex(t.trim);
  const lip = hex(t.floorAlt);
  ground(c, {
    right: soil,
    left: shade(soil, 0.12),
    open: null,
    pit: {
      depth: POND,
      top: (x, y) => (cellHash(x, y, 33) < 0.5 ? WATER : shade(WATER, 0.06)),
      right: shade(soil, -0.12),
      left: soil,
    },
    decor: (f) => {
      // Labio de césped arriba; en la losa exterior, piedrecitas y raíces
      if (f.ofHole) return;
      const s = { ...f, z0: 0, z1: -3 };
      g.poly(facePts(s)).fill(f.side === 'R' ? shade(lip, -0.18) : lip);
      if (!f.outer) return;
      const mid = f.side === 'R' ? [f.x1, f.y + 0.5] : [f.x + 0.5, f.y1];
      const h = cellHash(f.x, f.y, f.side === 'R' ? 31 : 32);
      const st = P(mid[0], mid[1], -5 - 3 * h);
      if (h < 0.5) g.ellipse(st[0] + (h - 0.25) * 12, st[1], 2.4, 1.2).fill(shade(soil, -0.25));
      else if (h > 0.8) line(g, [st[0], st[1] - 3, st[0] + 1.5, st[1] + 1, st[0] - 0.5, st[1] + 4], 1, shade(soil, -0.35), 0.8);
    },
  });

  drawTree(c);
  drawHedge(c, 0);
  drawHedge(c, 1);
  drawFence(c, 0);
  drawFence(c, 1);

  // Estanque: ondas y nenúfares sobre el agua
  const open = openHoles(W, H, holes);
  for (const k of holes) {
    if (open.has(k)) continue;
    const [x, y] = k.split(',').map(Number);
    const h = cellHash(x, y, 34);
    const r = toScreen(x + 0.3 + 0.4 * h, y + 0.3 + 0.4 * cellHash(x, y, 35), -POND);
    line(g, [r.x - 5, r.y, r.x + 5, r.y], 1.2, 0xffffff, 0.45);
    if (h < 0.45) {
      const p = toScreen(x + 0.5 + (h - 0.2), y + 0.55, -POND);
      g.ellipse(p.x, p.y, 6, 3).fill(PAD).stroke({ width: 1.2, color: LINE, alpha: 0.7 });
      g.poly([p.x, p.y, p.x + 6, p.y - 1, p.x + 5, p.y + 1.5]).fill(WATER);
      if (h < 0.15) {
        g.circle(p.x - 1, p.y - 2, 2.4).fill(0xff9ec4);
        g.circle(p.x - 1, p.y - 2.5, 1.1).fill(0xffd84d);
      }
    }
  }

  // Césped sin damero: dos verdes casi iguales repartidos por hash
  floorCells(c, (x, y) => (cellHash(x, y, 1) < 0.5 ? hex(t.floor) : shadeHex(t.floor, -0.035)));
  contactShadow(c, 0.16);

  // Piedras de orilla alrededor del estanque (planas: van sobre el borde del césped)
  for (const k of holes) {
    if (open.has(k)) continue;
    const [x, y] = k.split(',').map(Number);
    for (const [nx, ny, ex, ey] of [
      [x - 1, y, x, y + 0.5],
      [x, y - 1, x + 0.5, y],
      [x + 1, y, x + 1, y + 0.5],
      [x, y + 1, x + 0.5, y + 1],
    ]) {
      if (!isFloor(c, nx, ny)) continue;
      const s = toScreen(ex, ey);
      const rx = 4.5 + 2 * cellHash(nx, ny, 36);
      g.ellipse(s.x, s.y + 1.2, rx, rx / 2).fill(shade(STONE, -0.2));
      g.ellipse(s.x, s.y, rx, rx / 2).fill(STONE).stroke(INNER);
    }
  }

  // Camino de losas de piedra desde el borde delantero hacia el fondo (rodea el agua)
  for (let i = 0; i < 9; i++) {
    const gx = W * 0.3 + i * 0.55 + (cellHash(i, 0, 41) - 0.5) * 0.3;
    const gy = H - 0.6 - i * 1.1;
    if (gy < 0.8) break;
    if (!isFloor(c, Math.floor(gx), Math.floor(gy))) continue;
    const s = toScreen(gx, gy);
    const rx = 7 + 3 * cellHash(i, 1, 42);
    g.ellipse(s.x, s.y + 1.5, rx, rx / 2).fill(shade(STONE, -0.18));
    g.ellipse(s.x, s.y, rx, rx / 2).fill(STONE).stroke(INNER);
  }

  // Matas, florecillas, tréboles y setas
  const blade = shadeHex(t.floorAlt, -0.18);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (!isFloor(c, x, y)) continue;
      const h = cellHash(x, y, 7);
      if (h >= 0.34) continue;
      const s = toScreen(x + 0.25 + 0.5 * cellHash(x, y, 8), y + 0.25 + 0.5 * cellHash(x, y, 9));
      if (h < 0.17) {
        line(g, [s.x - 3, s.y - 5, s.x - 1, s.y], 1.5, blade);
        line(g, [s.x, s.y - 7, s.x, s.y], 1.5, blade);
        line(g, [s.x + 3, s.y - 5, s.x + 1, s.y], 1.5, blade);
      } else if (h < 0.26) {
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
      } else if (h < 0.31) {
        for (const [dx, dy] of [
          [-1.8, 0],
          [1.8, 0],
          [0, -1.4],
        ]) {
          g.circle(s.x + dx, s.y + dy, 1.8).fill(shade(blade, 0.15));
        }
      } else {
        g.rect(s.x - 0.8, s.y - 4, 1.6, 4).fill(0xf3ead8);
        g.ellipse(s.x, s.y - 4.5, 3.4, 2.2).fill(0xe2445c).stroke({ width: 1, color: LINE, alpha: 0.7 });
        g.circle(s.x - 1, s.y - 5, 0.6).fill(0xffffff);
        g.circle(s.x + 1.2, s.y - 4.3, 0.5).fill(0xffffff);
      }
    }
  }

  const sun = toScreen(W * 0.45, H * 0.4);
  g.ellipse(sun.x, sun.y, 95, 47).fill({ color: hex(t.light), alpha: 0.2 });
  floorBorder(c);
}

/** Brillos del agua del estanque. */
function pondGlints(W: number, H: number, holes: Set<string>): Twinkle[] {
  const open = openHoles(W, H, holes);
  const out: Twinkle[] = [];
  for (const k of holes) {
    if (open.has(k)) continue;
    const [x, y] = k.split(',').map(Number);
    if (cellHash(x, y, 37) > 0.6) continue;
    const s = toScreen(x + 0.2 + 0.6 * cellHash(x, y, 38), y + 0.2 + 0.6 * cellHash(x, y, 39), -POND);
    out.push({ x: s.x, y: s.y, size: 3, phase: cellHash(x, y, 40) * Math.PI * 2 });
  }
  return out;
}

// ───────────────────────── Santuario (templo de meditación, con jardín seco) ─────────────────────────
// wall/wallShade: papel shōji · floor/floorAlt: tatami · trim: laca roja de pilares y viga ·
// sky: atardecer de la ventana redonda · light: luz cálida. El hueco del borde es un karesansui
// (grava rastrillada) un escalón por debajo de la tarima.

const WOOD = 0x5a3a22;
const WOOD_L = 0x9a6a3e;
const HERI = 0x3b4a2a;
const STRAW = 0xd9b866;
const GRAVEL = 0xe3ddcd;
const ROCK = 0x8d8a83;
const MOSS = 0x6f9a4a;
const BAMBOO = 0xb8b15a;
const ZEN = 6;
const BEAM0 = WALL_H - 16;
const BEAM1 = WALL_H - 7;

function drawShoji(c: ShellCtx, side: 0 | 1, skip: [number, number] | null): void {
  const { g, W, H } = c;
  const len = side === 0 ? H : W;
  const at = (pos: number, z: number) => onWall(side, pos, z);
  const alpha = side === 0 ? 0.7 : 0.8;
  const z0 = 10;
  const z1 = BEAM0;
  for (let p0 = 0; p0 < len; p0 += 2) {
    const p1 = Math.min(len, p0 + 2);
    if (skip && p1 > skip[0] && p0 < skip[1]) continue; // tramo de pared lisa (ventana, hornacina)
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
        let mw = Math.min(w0, W - mx);
        let mh = Math.min(h0, H - my);
        if (mw <= 0 || mh <= 0) continue;
        // Si la estera pisa un hueco, se recorta a las celdas con suelo (o se queda en 1×1).
        if (!isFloor(c, mx, my)) continue;
        if (mw === 2 && !isFloor(c, mx + 1, my)) mw = 1;
        if (mh === 2 && !isFloor(c, mx, my + 1)) mh = 1;
        const fill = cellHash(mx, my, 3) < 0.5 ? hex(t.floor) : shadeHex(t.floor, 0.05);
        g.poly(quad(mx, my, mx + mw, my + mh)).fill(fill);
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

/** Hornacina (tokonoma) metida en la pared izquierda, con su tarima elevada. */
function drawTokonoma(c: ShellCtx, y0: number, y1: number): void {
  const { g, t } = c;
  const d = -0.4;
  const z0 = 12;
  const z1 = 64;
  g.poly([...P(d, y0, z1), ...P(d, y1, z1), ...P(d, y1, z0), ...P(d, y0, z0)]).fill(shadeHex(t.wall, -0.14));
  // Cara interior que se ve (la del lado y0) y techo en sombra
  g.poly([...P(0, y0, z1), ...P(d, y0, z1), ...P(d, y0, z0), ...P(0, y0, z0)]).fill(shadeHex(t.wall, -0.05));
  g.poly([...P(0, y0, z1), ...P(0, y1, z1), ...P(d, y1, z1), ...P(d, y0, z1)]).fill(shadeHex(t.wall, -0.3));
  // Tarima de madera (toko-gamachi) y su frente
  g.poly([...P(0, y0, z0), ...P(0, y1, z0), ...P(d, y1, z0), ...P(d, y0, z0)]).fill(WOOD_L).stroke(INNER);
  g.poly([...P(0, y0, z0), ...P(0, y1, z0), ...P(0, y1, z0 - 4), ...P(0, y0, z0 - 4)]).fill(WOOD).stroke(INNER);
  // Ikebana: jarrón y ramas
  const v = toScreen(d / 2, (y0 + y1) / 2, z0);
  g.poly([v.x - 3, v.y - 9, v.x + 3, v.y - 9, v.x + 2, v.y, v.x - 2, v.y]).fill(0x3c5a7a).stroke({ width: 1.2, color: LINE });
  line(g, [v.x, v.y - 9, v.x - 6, v.y - 22, v.x - 9, v.y - 27], 1.5, WOOD);
  line(g, [v.x, v.y - 9, v.x + 5, v.y - 19], 1.5, WOOD);
  for (const [dx, dy] of [
    [-9, -27],
    [-6, -22],
    [5, -19],
    [-3, -16],
  ]) {
    g.circle(v.x + dx, v.y + dy, 2).fill(0xff9ec4);
  }
  // Marco: poste lacado y dintel
  line(g, [...P(0, y0, 0), ...P(0, y0, z1)], 3, WOOD);
  line(g, [...P(0, y1, 0), ...P(0, y1, z1)], 3, WOOD);
  line(g, [...P(0, y0, z1), ...P(0, y1, z1)], 3, WOOD);
}

/** Farolillo de papel colgado de la viga, sobre una pared. */
function drawLantern(c: ShellCtx, side: 0 | 1, pos: number): void {
  const { g } = c;
  const [tx, ty] = onWall(side, pos, BEAM0, 0.15);
  const cy = ty + 16;
  line(g, [tx, ty, tx, cy - 7], 1, LINE, 0.8);
  g.rect(tx - 3, cy - 8, 6, 2).fill(LINE);
  g.ellipse(tx, cy, 6, 7).fill(0xd94a3a).stroke({ width: 1.5, color: LINE });
  g.ellipse(tx - 1.5, cy - 1, 2.5, 4.5).fill({ color: 0xffd296, alpha: 0.6 });
  for (const dy of [-3.5, 0, 3.5]) line(g, [tx - 5.5 * Math.sqrt(1 - (dy / 7) ** 2), cy + dy, tx + 5.5 * Math.sqrt(1 - (dy / 7) ** 2), cy + dy], 1, LINE, 0.4);
  g.rect(tx - 3, cy + 6, 6, 2).fill(LINE);
  line(g, [tx, cy + 8, tx, cy + 12], 1.5, 0xd94a3a);
}

function drawShrine(c: ShellCtx): void {
  const { g, t, W, H, holes } = c;
  const red = hex(t.trim);
  ground(c, {
    right: shade(WOOD_L, -0.18),
    left: WOOD_L,
    open: {
      depth: ZEN,
      top: (x, y) => (cellHash(x, y, 71) < 0.5 ? GRAVEL : shade(GRAVEL, -0.03)),
      right: shade(WOOD, 0.1),
      left: shade(WOOD_L, -0.05),
    },
    decor: (f) => {
      if (f.outer && !f.ofHole) {
        // Tablas de la tarima (engawa)
        const mid = f.side === 'R' ? P(f.x1, f.y + 1) : P(f.x + 1, f.y1);
        line(g, [mid[0], mid[1], mid[0], mid[1] + SLAB], 1, WOOD, 0.5);
      } else if (!f.outer) {
        // Canto de bambú del jardín seco
        g.poly(facePts({ ...f, z0: 0, z1: -2 })).fill(f.side === 'R' ? shade(BAMBOO, -0.18) : BAMBOO);
      }
    },
  });

  // Jardín seco: grava rastrillada y rocas con musgo (bajas: no asoman del nivel de la tarima)
  const zen = openHoles(W, H, holes);
  const box = boxOf(zen);
  const rocks: [number, number, number][] = box
    ? [
        [box.x0 + 1.3, box.y0 + 1.0, 1],
        [box.x0 + (box.x1 - box.x0) * 0.7, box.y0 + 0.9, 0.75],
      ]
    : [];
  for (const k of zen) {
    const [x, y] = k.split(',').map(Number);
    for (let f = 0.2; f < 1; f += 0.2) {
      const pts: number[] = [];
      for (let s = 0; s <= 4; s++) {
        const gx = x + s / 4;
        const gy = y + f;
        // Las líneas rodean las rocas
        let off = 0;
        for (const [rx, ry, rk] of rocks) {
          const d = Math.hypot(gx - rx, gy - ry);
          if (d < 0.9 * rk) off += (gy - ry) * 0.35 * (1 - d / (0.9 * rk));
        }
        pts.push(...P(gx, gy + off, -ZEN));
      }
      line(g, pts, 1, shade(GRAVEL, -0.18), 0.7);
    }
  }
  for (const [rx, ry, rk] of rocks) {
    g.poly(floorRing(rx, ry, 0.75 * rk, 28, -ZEN)).stroke({ width: 1, color: shade(GRAVEL, -0.2), alpha: 0.8 });
    g.poly(floorRing(rx, ry, 0.55 * rk, 24, -ZEN)).fill(shade(MOSS, -0.05));
    const s = toScreen(rx, ry, -ZEN);
    const w = 10 * rk;
    const h = 7 * rk;
    g.poly([s.x - w, s.y, s.x - w * 0.6, s.y - h, s.x + w * 0.1, s.y - h * 1.15, s.x + w * 0.8, s.y - h * 0.5, s.x + w, s.y])
      .fill(ROCK)
      .stroke({ width: 1.5, color: LINE });
    g.poly([s.x + w * 0.1, s.y - h * 1.15, s.x + w * 0.8, s.y - h * 0.5, s.x + w, s.y, s.x + w * 0.2, s.y]).fill(shade(ROCK, -0.18));
    g.ellipse(s.x - w * 0.3, s.y - h * 0.85, w * 0.3, h * 0.2).fill(MOSS);
  }

  walls(c, hex(t.wall), hex(t.wallShade));
  const winX = W * 0.75;
  const winR = 1.25;
  const toko: [number, number] = [6, 8];
  drawShoji(c, 0, toko);
  drawShoji(c, 1, [winX - winR - 0.1, winX + winR + 0.1]);
  band(c, 0, 10, WOOD, shade(WOOD, -0.18)); // zócalo de madera (koshi-ita)
  band(c, BEAM0, BEAM1, red, shade(red, -0.18)); // viga lacada
  band(c, BEAM1, WALL_H, WOOD, shade(WOOD, -0.18));
  wallLine(c, BEAM0, 1.5, LINE, 0.6);
  drawMoonWindow(c, winX, 47, winR);
  drawTokonoma(c, toko[0] + 0.2, toko[1] - 0.2);

  drawTatami(c);
  // Luz de la ventana redonda, como un óvalo sobre el tatami
  g.poly(floorRing(winX + 1.2, 2.4, 1.15)).fill({ color: hex(t.light), alpha: 0.28 });
  g.poly(floorRing(winX + 1.2, 2.4, 1.6)).fill({ color: hex(t.light), alpha: 0.12 });
  contactShadow(c);

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
  drawLantern(c, 1, 2.2);
  drawLantern(c, 1, W / 2 - 1.6);
  floorBorder(c);
  wallOutline(c);
  wallThickness(c, shade(WOOD, 0.2), WOOD_L);
}

// ───────────────────────── Cita Final (sala celeste legendaria) ─────────────────────────
// wall/wallShade: cielo nocturno de las paredes · floor/floorAlt: mármol · trim: oro ·
// sky: interior del portal · light: luz de luna (cristales, estrellas grandes y reflejo). Los
// huecos son vacío: la plataforma flota con el borde escalonado y un islote suelto delante.

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

/** Cristal que cuelga bajo la losa, con su cara en sombra. */
function crystal(g: Graphics, x: number, y: number, k: number, color: number): void {
  const w = 6 * k;
  const d = 14 * k;
  g.poly([x - w, y, x, y + 2, x, y + d]).fill(color).stroke({ width: 1.5, color: LINE });
  g.poly([x, y + 2, x + w, y, x, y + d]).fill(shade(color, -0.18)).stroke({ width: 1.5, color: LINE });
}

/** Islote que flota en el vacío, con un cristal encima. */
function drawIslet(c: ShellCtx, gx: number, gy: number, gold: number, moon: number): void {
  const { g, t } = c;
  const z = -9;
  const r = 0.5;
  const top = [...P(gx - r, gy - r, z), ...P(gx + r, gy - r, z), ...P(gx + r, gy + r, z), ...P(gx - r, gy + r, z)];
  const tip = toScreen(gx + r, gy + r, z - 18);
  const stone = shadeHex(t.floorAlt, -0.4);
  g.poly([...P(gx + r, gy - r, z), ...P(gx + r, gy + r, z), tip.x, tip.y]).fill(shade(stone, -0.18)).stroke({ width: 1.5, color: LINE });
  g.poly([...P(gx - r, gy + r, z), ...P(gx + r, gy + r, z), tip.x, tip.y]).fill(stone).stroke({ width: 1.5, color: LINE });
  g.poly(top).fill(hex(t.floor)).stroke({ width: 1.5, color: LINE });
  g.poly([...P(gx - r, gy + r, z), ...P(gx + r, gy + r, z), ...P(gx + r, gy - r, z)], false).stroke({ width: 2, color: gold });
  const s = toScreen(gx, gy, z);
  g.poly([s.x - 4, s.y, s.x, s.y - 14, s.x, s.y + 1]).fill(moon).stroke({ width: 1.2, color: LINE });
  g.poly([s.x, s.y - 14, s.x + 4, s.y, s.x, s.y + 1]).fill(shade(moon, -0.18)).stroke({ width: 1.2, color: LINE });
  g.ellipse(s.x, s.y - 4, 12, 6).fill({ color: moon, alpha: 0.15 });
}

function drawCelestial(c: ShellCtx): void {
  const { g, t, W, H, holes } = c;
  const gold = hex(t.trim);
  const moon = hex(t.light);

  // Losa flotante con filo dorado en cada borde y cristales colgando de algunos
  const stone = shadeHex(t.floorAlt, -0.4);
  // Islotes primero: quedan detrás de la losa
  ground(c, {
    right: shade(stone, -0.18),
    left: stone,
    open: null,
    decor: (f) => {
      g.poly(facePts({ ...f, z0: 0, z1: -2.5 })).fill(f.side === 'R' ? shade(gold, -0.18) : gold);
      if (cellHash(f.x, f.y, f.side === 'R' ? 81 : 82) > 0.42) return;
      const along = 0.3 + 0.4 * cellHash(f.x, f.y, 83);
      const s = toScreen(f.x0 + (f.x1 - f.x0) * along, f.y0 + (f.y1 - f.y0) * along, -SLAB);
      crystal(g, s.x, s.y, 0.7 + 0.4 * cellHash(f.x, f.y, 84), moon);
    },
  });

  const box = boxOf(openHoles(W, H, holes));
  if (box) drawIslet(c, box.x1 - 1.4, box.y1 - 1.2, gold, moon);

  walls(c, hex(t.wall), hex(t.wallShade));
  // Nebulosas tenues en las paredes
  for (const [side, pos, z, rx, color] of [
    [0, H * 0.35, 58, 34, 0xa35ad0],
    [0, H * 0.75, 36, 26, 0x5b8fe0],
    [1, W * 0.25, 44, 36, 0xe39ae8],
    [1, W * 0.88, 64, 22, 0x5b8fe0],
  ] as [0 | 1, number, number, number, number][]) {
    const [nx, ny] = onWall(side, pos, z);
    g.ellipse(nx, ny, rx, rx * 0.45).fill({ color, alpha: 0.12 });
    g.ellipse(nx + rx * 0.2, ny - 2, rx * 0.55, rx * 0.25).fill({ color, alpha: 0.12 });
  }
  for (const st of celestialStars(W, H)) {
    if (st.big) sparkle(g, st.x, st.y, 3.5, moon, 0.9);
    else g.circle(st.x, st.y, st.r).fill({ color: STAR, alpha: 0.5 + st.r * 0.3 });
  }
  band(c, 0, 7, gold, shade(gold, -0.18));
  band(c, WALL_H - 7, WALL_H, gold, shade(gold, -0.18));
  for (const z of [10, WALL_H - 10]) wallLine(c, z, 1, gold, 0.6);
  drawPortal(c);

  // Mármol con juntas doradas y vetas
  floorCells(c, (x, y) => ((x + y) % 2 === 1 ? hex(t.floorAlt) : hex(t.floor)));
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (!isFloor(c, x, y)) continue;
      const h = cellHash(x, y, 51);
      if (h <= 0.3) line(g, [...P(x + 0.15, y + 0.3 + h), ...P(x + 0.5, y + 0.5), ...P(x + 0.85, y + 0.2 + h)], 1, 0xffffff, 0.2);
      if (isFloor(c, x + 1, y)) line(g, [...P(x + 1, y), ...P(x + 1, y + 1)], 1, gold, 0.5);
      if (isFloor(c, x, y + 1)) line(g, [...P(x, y + 1), ...P(x + 1, y + 1)], 1, gold, 0.5);
    }
  }
  contactShadow(c, 0.18);
  // Escalón del portal: se asoma un poco al suelo
  const pt = portalOf(W);
  g.poly(quad(pt.cx - pt.hw, 0, pt.cx + pt.hw, 0.35)).fill(shade(gold, -0.1)).stroke(INNER);

  // Círculo rúnico en el centro de la plataforma
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
  wallThickness(c, shade(gold, 0.15), shadeHex(t.wall, -0.1));
}

// ───────────────────────── Registro ─────────────────────────

const STYLES: Record<StyleId, RoomStyle> = {
  interior: { id: 'interior', topExtra: 0, bottomExtra: 0, draw: drawInterior },
  garden: { id: 'garden', topExtra: 42, bottomExtra: 0, exterior: true, draw: drawGarden, twinkles: pondGlints },
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
