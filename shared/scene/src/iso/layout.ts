/**
 * Huellas y validación de colocación en la rejilla del hábitat.
 *
 * Es el mismo contrato que `backend/src/modules/habitat/habitat-layout.ts` (el servidor es la
 * autoridad; aquí solo se usa para la vista previa verde/roja y para saber qué celdas pisa el
 * Pockai). Si cambias una regla, cámbiala en los dos sitios: los tests de ambos lados la cubren.
 */
export type Mount = 'floor' | 'wall';

export interface FurnitureShape {
  footprint?: [number, number];
  mount?: Mount;
}

export interface Placement {
  x: number;
  y: number;
  rotation: number;
}

export interface PlacedShape extends Placement, FurnitureShape {
  id?: string;
}

export type PlacementError = 'out_of_bounds' | 'not_on_wall' | 'collision';

export function normalizeRotation(rotation: number | undefined): 0 | 1 | 2 | 3 {
  const r = Math.trunc(rotation ?? 0);
  return (((r % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

export function rotatedFootprint(shape: FurnitureShape, rotation: number): [number, number] {
  const [w, d] = shape.footprint ?? [1, 1];
  return normalizeRotation(rotation) % 2 === 0 ? [w, d] : [d, w];
}

export function footprintCells(shape: FurnitureShape, p: Placement): string[] {
  const [w, d] = rotatedFootprint(shape, p.rotation);
  const cells: string[] = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < d; dy++) cells.push(`${p.x + dx},${p.y + dy}`);
  return cells;
}

export function validatePlacement(
  room: { gridWidth: number; gridHeight: number },
  shape: FurnitureShape,
  p: Placement,
  others: PlacedShape[],
): PlacementError | null {
  const [w, d] = rotatedFootprint(shape, p.rotation);
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return 'out_of_bounds';
  if (p.x < 0 || p.y < 0 || p.x + w > room.gridWidth || p.y + d > room.gridHeight) return 'out_of_bounds';
  const mount = shape.mount ?? 'floor';
  if (mount === 'wall') {
    const onWall = normalizeRotation(p.rotation) % 2 === 0 ? p.y === 0 : p.x === 0;
    if (!onWall) return 'not_on_wall';
  }
  const mine = new Set(footprintCells(shape, p));
  for (const o of others) {
    if ((o.mount ?? 'floor') !== mount) continue;
    if (footprintCells(o, o).some((c) => mine.has(c))) return 'collision';
  }
  return null;
}

/**
 * Para un mueble de pared, la posición válida más cercana a la celda pedida: lo pega a la pared
 * que toque según su giro (y = 0 con giro par, x = 0 con impar).
 */
export function snapToWall(p: Placement): Placement {
  return normalizeRotation(p.rotation) % 2 === 0 ? { ...p, y: 0 } : { ...p, x: 0 };
}
