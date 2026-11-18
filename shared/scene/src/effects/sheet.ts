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
}

export function frameSize(sheet: FrameSheet, index: number): { w: number; h: number } {
  const rows = sheet.frames[index] ?? [];
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/** Esquina superior izquierda del frame en la rejilla del efecto. */
export function frameOrigin(sheet: FrameSheet, index: number, pos: SheetPos): { x: number; y: number } {
  const { w, h } = frameSize(sheet, index);
  return { x: pos.align === 'left' ? pos.x : Math.round(pos.x - w / 2), y: pos.bottom - h + 1 };
}

/** Pinta el frame `index` con un color por rol (un rol sin color no se pinta). */
export function paintSheetFrame(c: Canvas2, sheet: FrameSheet, index: number, colors: Record<string, string | undefined>, pos: SheetPos): void {
  const rows = sheet.frames[index];
  if (!rows) return;
  const o = frameOrigin(sheet, index, pos);
  const byCode = sheet.roles.map((r) => colors[r]);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row.charCodeAt(x) - 97;
      if (k < 0) continue; // '.'
      const col = byCode[k];
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
