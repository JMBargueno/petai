import type { Canvas2 } from './fxMath';

/**
 * Láminas de frames dibujadas con Nano Banana e importadas POR ROLES de color
 * (`scripts/sprites/effects/import.mjs`). Cada frame es una lista de filas; cada carácter es un rol
 * (`a` = `roles[0]`, `b` = `roles[1]`…) o `.` (vacío). Quien pinta decide el color de cada rol, así
 * que una misma lámina se tiñe con el Flujo del Pockai, el metal de un cofre o el papel de un sobre.
 */
export interface FrameSheet {
  roles: string[];
  frames: string[][];
}

export interface SheetPos {
  /** Columna del centro (`align: 'center'`) o del borde izquierdo (`'left'`). */
  x: number;
  /** Fila de la base: la última fila del frame cae aquí. */
  bottom: number;
  align?: 'center' | 'left';
  /** Espejo horizontal (la mano derecha es la izquierda reflejada). */
  flipX?: boolean;
  /** Estrecha el frame en horizontal (0..1, desde su centro): un portal que se abre. */
  scaleX?: number;
  /** No pinta por debajo de esta fila (lo que se hunde en el suelo no se ve). */
  clipBottom?: number;
}

/** Un color por rol, o una función rol × fila (en coordenadas del frame) para colorear por altura. */
export type SheetColors = Record<string, string | undefined> | ((role: string, y: number, h: number) => string | undefined);

export function frameSize(sheet: FrameSheet, index: number): { w: number; h: number } {
  const rows = sheet.frames[index] ?? [];
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/** Esquina superior izquierda del frame en la rejilla del efecto. */
export function frameOrigin(sheet: FrameSheet, index: number, pos: SheetPos): { x: number; y: number } {
  const { h } = frameSize(sheet, index);
  const w = Math.max(1, Math.round(frameSize(sheet, index).w * (pos.scaleX ?? 1)));
  return { x: pos.align === 'left' ? pos.x : Math.round(pos.x - w / 2), y: pos.bottom - h + 1 };
}

/** Pinta el frame `index` con un color por rol (un rol sin color no se pinta). */
export function paintSheetFrame(c: Canvas2, sheet: FrameSheet, index: number, colors: SheetColors, pos: SheetPos): void {
  const rows = sheet.frames[index];
  if (!rows) return;
  const o = frameOrigin(sheet, index, pos);
  const srcW = rows[0]?.length ?? 0;
  const w = Math.max(1, Math.round(srcW * (pos.scaleX ?? 1)));
  const color = typeof colors === 'function' ? colors : (role: string) => colors[role];
  rows.forEach((row, y) => {
    if (pos.clipBottom !== undefined && o.y + y > pos.clipBottom) return;
    for (let x = 0; x < w; x++) {
      // Columna de origen: estrechada desde el centro y, si toca, reflejada
      let sx = w === srcW ? x : Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / w));
      if (pos.flipX) sx = srcW - 1 - sx;
      const k = row.charCodeAt(sx) - 97;
      if (k < 0) continue; // '.'
      const col = color(sheet.roles[k]!, y, rows.length);
      if (col) c.set(o.x + x, o.y + y, col);
    }
  });
}

/** Centro (en coordenadas del frame) de los píxeles de un rol; `null` si el frame no lo tiene. */
export function roleCenter(sheet: FrameSheet, index: number, role: string): { x: number; y: number } | null {
  const code = String.fromCharCode(97 + sheet.roles.indexOf(role));
  let sx = 0, sy = 0, n = 0;
  (sheet.frames[index] ?? []).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === code) { sx += x; sy += y; n++; }
  });
  return n ? { x: sx / n, y: sy / n } : null;
}
