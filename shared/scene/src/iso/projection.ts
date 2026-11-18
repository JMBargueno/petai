/**
 * Proyección dimétrica 2:1 de la sala (GUIA_ARTISTICA §7.4). Una celda es un rombo de 32×16 px a
 * escala 1. El eje x de la rejilla va hacia abajo-derecha y el y hacia abajo-izquierda; el origen
 * (0, 0) es la esquina del fondo, donde se juntan las dos paredes.
 *
 *   pared derecha (fondo): a lo largo de y = 0     pared izquierda (fondo): a lo largo de x = 0
 */
export const TILE_W = 32;
export const TILE_H = 16;

export interface ScreenPt {
  x: number;
  y: number;
}

/** Punto de la rejilla (puede ser fraccionario) → píxeles relativos al origen. `z` sube. */
export function toScreen(gx: number, gy: number, z = 0): ScreenPt {
  return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) - z };
}

/** Píxeles relativos al origen (sobre el suelo) → punto de la rejilla fraccionario. */
export function toGrid(sx: number, sy: number): { gx: number; gy: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/**
 * Clave de profundidad: se pinta antes lo de menor valor. Se usa el centro del objeto en la
 * rejilla (x + y), que ordena bien huellas de hasta 2×2 respecto a un Pockai de 1 celda.
 */
export function depthOf(cx: number, cy: number, bias = 0): number {
  return cx + cy + bias;
}
