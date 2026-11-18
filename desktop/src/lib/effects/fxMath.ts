/** Utilidades compartidas por los dibujos de efectos (deterministas: nada de Math.random). */

/** Hash entero estable → 0..1. */
export function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeIn(t: number): number {
  return t * t;
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Progreso local de un tramo [a, b] dentro de 0..1. */
export function span(t: number, a: number, b: number): number {
  return clamp01((t - a) / (b - a));
}

/**
 * Píxeles marcados en una máscara → se pintan con su color y, alrededor de toda la figura, un
 * contorno de 1 px (`outline`) donde no hay nada. Así cualquier forma se lee sobre cualquier fondo.
 */
export class Canvas2 {
  readonly cells: (string | null)[];
  constructor(readonly width: number, readonly height: number) {
    this.cells = new Array(width * height).fill(null);
  }
  set(x: number, y: number, color: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = color;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.cells[y * this.width + x];
  }
  /** Copia al destino añadiendo el contorno exterior. */
  flush(sink: { set(x: number, y: number, c: string): void }, outline: string | null) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c) {
          sink.set(x, y, c);
          continue;
        }
        if (outline && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) {
          sink.set(x, y, outline);
        }
      }
    }
  }
}

/** Complementario de un color #rrggbb: la paleta «invertida» del Prisma (LORE §3). */
export function invert(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return '#' + (0xffffff - n).toString(16).padStart(6, '0');
}

/** Corazón de 5×4 píxeles con la esquina superior izquierda en (x, y). */
export function heart(c: Canvas2, x: number, y: number, fill: string, shine: string) {
  const rows = ['.X.X.', 'XXXXX', '.XXX.', '..X..'];
  rows.forEach((r, j) => [...r].forEach((ch, i) => ch === 'X' && c.set(x + i, y + j, i === 1 && j === 1 ? shine : fill)));
}
