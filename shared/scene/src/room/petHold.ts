/**
 * Agarrar al Pockai con el ratón dentro de la sala: dónde aterriza al soltarlo.
 * Lógica pura (sin Pixi) para poder probarla.
 */
import type { Cell } from '../iso/pathfind';

/**
 * Celda libre más cercana a un punto fraccionario de la rejilla (puede caer fuera de la sala).
 * A igual distancia gana la primera que se recorre, así el resultado es estable. `null` si la
 * sala no tiene ninguna celda libre.
 */
export function nearestFreeCell(
  room: { gridWidth: number; gridHeight: number },
  blocked: Set<string>,
  target: { gx: number; gy: number },
): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let x = 0; x < room.gridWidth; x++) {
    for (let y = 0; y < room.gridHeight; y++) {
      if (blocked.has(`${x},${y}`)) continue;
      const d = Math.hypot(x + 0.5 - target.gx, y + 0.5 - target.gy);
      if (d < bestD) [best, bestD] = [{ x, y }, d];
    }
  }
  return best;
}
