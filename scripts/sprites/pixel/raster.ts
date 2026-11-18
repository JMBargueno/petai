/**
 * Rasterizador de pixel art (GUIA_ARTISTICA §7.5).
 *
 * Cada frame se dibuja desde cero sobre una rejilla nativa de 64×64 a partir de formas analíticas
 * (elipses y polígonos) ya transformadas por la pose. Nunca se escala ni se gira un mapa de bits:
 * así el contorno de 1 px sale limpio en todos los frames.
 *
 * La rejilla produce las dos hojas que hornean los clientes (`shared/scene/src/bake/bakePixels.ts`):
 *  - base: gris que multiplica al color (tono) o color literal;
 *  - mask: R = primario, G = secundario, B = zona de patrón; negro = "color literal".
 * El tono de luz no puede salir de multiplicar (eso solo oscurece): se consigue sumando una parte
 * del secundario en la máscara, que además gira la luz hacia el color cálido de la paleta.
 */
import { deflateSync } from 'node:zlib';

export const N = 64; // lado del frame nativo
export const FLOOR = 60; // fila del suelo
export const SCALE = 2; // la hoja se guarda a ×2 (frames de 128×128)

/** Papel de color de una pieza. */
export type Role =
  | 'body' // primario, con patrón
  | 'skin' // primario, sin patrón (cara y extremidades)
  | 'belly' // secundario
  | 'trait' // secundario con sombra propia (rasgo icónico)
  | 'mark'; // primario oscurecido (manchas y franjas)

export type Tone = 'line' | 'shade' | 'base' | 'light' | 'hi';

export type Rgb = [number, number, number];
export const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** Matriz afín 2×3: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];
export const IDENT: Mat = [1, 0, 0, 1, 0, 0];
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scaleAt = (sx: number, sy: number, x: number, y: number): Mat => [sx, 0, 0, sy, x - sx * x, y - sy * y];
export function rotateAt(deg: number, x: number, y: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
}
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

function inPoly(p: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Cell {
  part: number;
  role: Role;
  tone: Tone;
  /** Color literal (ojos, boca, efectos): no pasa por la paleta. */
  lit: Rgb | null;
  /** Rampa literal por tono (huevo): se sombrea y se contornea, pero no pasa por la paleta. */
  ramp?: Ramp;
}

/** Colores literales por tono para piezas que no usan la paleta de la mascota. */
export type Ramp = Record<Tone, Rgb>;

export interface ShapeOpts {
  /** Sin sombreado: toda la pieza en el tono base. */
  flat?: boolean;
  /** Con brillo (tono `hi`) en la zona más iluminada. */
  hi?: boolean;
  /** Solo pinta sobre píxeles de esta pieza. */
  clip?: number;
  /** Conserva el id de pieza de lo que tapa (barriga, manchas: sin línea de separación). */
  keep?: boolean;
  /** Tono fijo para toda la pieza. */
  tone?: Tone;
  /** Borra en lugar de pintar (recortes: la media luna). */
  erase?: boolean;
  /** Rampa literal en lugar de la paleta de la mascota. */
  ramp?: Ramp;
  /** Solo pinta dentro de este polígono (coordenadas locales): recorta una pieza por una línea. */
  within?: [number, number][];
}

// Dirección de la luz: arriba a la izquierda.
const LX = -0.55;
const LY = -0.83;

export class Grid {
  private cells: (Cell | null)[] = new Array(N * N).fill(null);
  /** Piezas que no reciben contorno (efectos sueltos). */
  private noOutline = new Set<number>();
  private stack: Mat[] = [IDENT];
  /** Caja de todas las formas pintadas, sin recortar al frame: dice cuánto se sale una pose. */
  extent: [number, number, number, number] = [N, N, 0, 0];

  get m(): Mat {
    return this.stack[this.stack.length - 1];
  }

  /** Ejecuta `fn` con una transformación añadida a la vigente. */
  with(t: Mat, fn: () => void): void {
    this.stack.push(mul(this.m, t));
    fn();
    this.stack.pop();
  }

  /** Punto local → rejilla, con la transformación vigente. */
  point(x: number, y: number): [number, number] {
    return apply(this.m, x, y);
  }

  private fill(
    part: number,
    role: Role,
    inside: (x: number, y: number) => boolean,
    box: [number, number, number, number],
    o: ShapeOpts,
  ): void {
    const [x0, y0, x1, y1] = box;
    if (o.clip === undefined && !o.erase) {
      const e = this.extent;
      this.extent = [Math.min(e[0], x0), Math.min(e[1], y0), Math.max(e[2], x1), Math.max(e[3], y1)];
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = Math.max(0.5, (x1 - x0) / 2);
    const hh = Math.max(0.5, (y1 - y0) / 2);
    const region = o.within?.map(([x, y]) => apply(this.m, x, y));
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(N - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(N - 1, Math.ceil(x1)); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        if (!inside(px, py)) continue;
        if (region && !inPoly(region, px, py)) continue;
        const i = y * N + x;
        const prev = this.cells[i];
        if (o.clip !== undefined && prev?.part !== o.clip) continue;
        if (o.erase) {
          this.cells[i] = null;
          continue;
        }
        let tone: Tone = o.tone ?? 'base';
        if (!o.flat && !o.tone) {
          const t = ((px - cx) / hw) * LX + ((py - cy) / hh) * LY;
          if (o.hi && t > 0.86) tone = 'hi';
          else if (t > 0.42) tone = 'light';
          else if (t < -0.4) tone = 'shade';
        }
        this.cells[i] = { part: o.keep && prev ? prev.part : part, role, tone, lit: null, ramp: o.ramp };
      }
    }
  }

  /** Elipse (admite giro en grados alrededor de su centro). */
  ellipse(part: number, role: Role, cx: number, cy: number, rx: number, ry: number, o: ShapeOpts & { rot?: number } = {}): void {
    if (rx <= 0 || ry <= 0) return;
    let m = mul(this.m, translate(cx, cy));
    if (o.rot) m = mul(m, rotateAt(o.rot, 0, 0));
    m = mul(m, [rx, 0, 0, ry, 0, 0]);
    const inv = invert(m);
    // Caja envolvente de la elipse transformada.
    const ex = Math.hypot(m[0], m[2]);
    const ey = Math.hypot(m[1], m[3]);
    this.fill(
      part,
      role,
      (x, y) => {
        const [u, v] = apply(inv, x, y);
        return u * u + v * v <= 1;
      },
      [m[4] - ex, m[5] - ey, m[4] + ex, m[5] + ey],
      o,
    );
  }

  /** Polígono (cualquier orden de vértices). */
  poly(part: number, role: Role, pts: [number, number][], o: ShapeOpts = {}): void {
    const p = pts.map(([x, y]) => apply(this.m, x, y));
    const xs = p.map((q) => q[0]);
    const ys = p.map((q) => q[1]);
    this.fill(
      part,
      role,
      (x, y) => inPoly(p, x, y),
      [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      o,
    );
  }

  /** Píxel de color literal en coordenadas de rejilla (ya transformadas). */
  put(x: number, y: number, rgb: Rgb, part = 0): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const prev = this.cells[y * N + x];
    this.cells[y * N + x] = { part: part || prev?.part || 99, role: 'skin', tone: 'base', lit: rgb };
    if (!prev && !part) this.noOutline.add(99);
  }

  /** Línea de 1 px entre dos puntos locales (grietas), en color literal. */
  line(x0: number, y0: number, x1: number, y1: number, rgb: Rgb, clip?: number): void {
    const [ax, ay] = this.point(x0, y0);
    const [bx, by] = this.point(x1, y1);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n);
      const y = Math.round(ay + ((by - ay) * k) / n);
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const c = this.cells[y * N + x];
      if (clip !== undefined && c?.part !== clip) continue;
      this.cells[y * N + x] = { part: c?.part ?? 99, role: 'skin', tone: 'base', lit: rgb };
    }
  }

  rect(x: number, y: number, w: number, h: number, rgb: Rgb, part = 0): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, rgb, part);
  }

  /** Mapa de bits: filas de texto, '.' transparente, cada letra un color de `palette`. */
  bitmap(x: number, y: number, rows: string[], palette: Record<string, Rgb>, part = 0): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = palette[row[i]];
        if (c) this.put(x + i, y + j, c, part);
      }
    });
  }

  /** Marca la zona de cara (sin patrón) dentro de una pieza del cuerpo. */
  face(part: number, cx: number, cy: number, rx: number, ry: number): void {
    const [mx, my] = apply(this.m, cx, cy);
    for (let y = Math.max(0, Math.floor(my - ry)); y <= Math.min(N - 1, Math.ceil(my + ry)); y++) {
      for (let x = Math.max(0, Math.floor(mx - rx)); x <= Math.min(N - 1, Math.ceil(mx + rx)); x++) {
        const c = this.cells[y * N + x];
        const u = (x + 0.5 - mx) / rx;
        const v = (y + 0.5 - my) / ry;
        if (c && !c.lit && c.part === part && c.role === 'body' && u * u + v * v <= 1) c.role = 'skin';
      }
    }
  }

  /**
   * Contorno exterior de 1 px (vecindad de 4) y línea de separación entre piezas distintas.
   * La línea hereda el papel de color de su pieza: oscuro teñido, no negro.
   */
  outline(): void {
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? null : this.cells[y * N + x]);
    const solid = (c: Cell | null) => !!c && !this.noOutline.has(c.part);
    const out: [number, Cell][] = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = at(x, y);
        if (c) {
          if (c.lit || !solid(c)) continue;
          const r = at(x + 1, y);
          const d = at(x, y + 1);
          const differs = (o: Cell | null) => solid(o) && !o!.lit && o!.part !== c.part;
          if ((differs(r) || differs(d)) && c.role !== 'belly' && c.role !== 'mark') c.tone = 'line';
          continue;
        }
        const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].find((o) => solid(o) && !o!.lit);
        if (n) out.push([y * N + x, n]);
      }
    }
    for (const [i, n] of out) this.cells[i] = { part: n.part, role: n.role === 'body' ? 'skin' : n.role, tone: 'line', lit: null, ramp: n.ramp };
  }

  /** Caja que ocupa lo dibujado: [x mínima, y mínima, x máxima, y máxima]. */
  bounds(): [number, number, number, number] {
    let x0 = N, y0 = N, x1 = -1, y1 = -1;
    for (let i = 0; i < N * N; i++) {
      if (!this.cells[i]) continue;
      const x = i % N, y = Math.floor(i / N);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }

  /** Fila más alta con algún píxel (para medir la altura del dibujo). */
  top(): number {
    for (let i = 0; i < N * N; i++) if (this.cells[i]) return Math.floor(i / N);
    return N;
  }

  /** Pinta la rejilla, a ×2, en las hojas `base` y `mask` (RGBA) con origen (ox, oy). */
  blit(base: Uint8Array, mask: Uint8Array, sheetW: number, ox: number, oy: number): void {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = this.cells[y * N + x];
        if (!c) continue;
        const [b, m] = cellColors(c);
        for (let j = 0; j < SCALE; j++) {
          for (let i = 0; i < SCALE; i++) {
            const o = ((oy + y * SCALE + j) * sheetW + ox + x * SCALE + i) * 4;
            base[o] = b[0]; base[o + 1] = b[1]; base[o + 2] = b[2]; base[o + 3] = 255;
            mask[o] = m[0]; mask[o + 1] = m[1]; mask[o + 2] = m[2]; mask[o + 3] = 255;
          }
        }
      }
    }
  }
}

// Gris de base por tono. La línea queda por encima de 40 para que el horneado la multiplique por el
// color (oscuro teñido) en lugar de copiarla como negro; la base, en 239 (≤ 240) por la misma regla.
const GRAY: Record<Tone, number> = { line: 62, shade: 172, base: 239, light: 239, hi: 239 };

function cellColors(c: Cell): [Rgb, Rgb] {
  if (c.lit) return [c.lit, [0, 0, 0]];
  if (c.ramp) return [c.ramp[c.tone], [0, 0, 0]];
  let g = GRAY[c.tone];
  let mask: Rgb;
  switch (c.role) {
    case 'belly':
      mask = [0, 255, 0];
      if (c.tone === 'shade') g = 200;
      break;
    case 'trait':
      mask = [0, 255, 0];
      break;
    case 'mark':
      mask = [255, 0, 0];
      if (c.tone !== 'line') g = 128;
      break;
    case 'skin':
      mask = [255, c.tone === 'light' ? 64 : c.tone === 'hi' ? 128 : 0, 0];
      break;
    default:
      mask = [255, c.tone === 'light' ? 64 : c.tone === 'hi' ? 128 : 0, c.tone === 'line' ? 0 : 255];
  }
  return [[g, g, g], mask];
}

// ───────────────────────── PNG ─────────────────────────

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Codifica un buffer RGBA como PNG de 8 bits (determinista: misma entrada, mismos bytes). */
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
