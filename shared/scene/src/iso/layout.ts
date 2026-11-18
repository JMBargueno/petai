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

export interface RoomGrid {
  gridWidth: number;
  gridHeight: number;
  /** Celdas sin suelo (forma de la sala). */
  blocked?: BlockedRect[] | null;
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
  room: RoomGrid,
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
  if (mount === 'floor' && room.blocked?.length) {
    const holes = roomBlockedCells(room);
    for (const c of mine) if (holes.has(c)) return 'out_of_bounds';
  }
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

/** Primer hueco válido para `shape` (x, luego y; rotación 0 y después 1). Igual que en el backend. */
export function findFreePlacement(room: RoomGrid, shape: FurnitureShape, others: PlacedShape[]): Placement | null {
  for (const rotation of [0, 1]) {
    for (let x = 0; x < room.gridWidth; x++) {
      for (let y = 0; y < room.gridHeight; y++) {
        const p = { x, y, rotation };
        if (validatePlacement(room, shape, p, others) === null) return p;
      }
    }
  }
  return null;
}

/** Rectángulo `[x, y, ancho, fondo]` de celdas sin suelo (estanque, escalón, abismo…). */
export type BlockedRect = [number, number, number, number];

/**
 * Celdas `"x,y"` sin suelo de una sala (`blocked` en habitats.json). Ahí no va ningún mueble de
 * suelo ni pasa el Pockai; la forma de cada sala sale de aquí.
 */
export function roomBlockedCells(room: { blocked?: BlockedRect[] | null }): Set<string> {
  const out = new Set<string>();
  for (const [bx, by, bw, bh] of room.blocked ?? []) {
    for (let dx = 0; dx < bw; dx++) for (let dy = 0; dy < bh; dy++) out.add(`${bx + dx},${by + dy}`);
  }
  return out;
}

/**
 * Reglas de forma de una sala: los huecos no tocan las paredes del fondo (fila y = 0, columna
 * x = 0), las celdas con suelo forman una sola región conexa y una huella de `maxFootprint`
 * cabe en algún sitio. Devuelve los problemas encontrados (vacío si la forma es válida).
 */
export function roomShapeErrors(room: RoomGrid, maxFootprint: [number, number] = [1, 1]): string[] {
  const errors: string[] = [];
  const W = room.gridWidth;
  const H = room.gridHeight;
  for (const r of room.blocked ?? []) {
    const [bx, by, bw, bh] = r;
    if (r.length !== 4 || ![bx, by, bw, bh].every(Number.isInteger) || bw < 1 || bh < 1) errors.push(`hueco mal formado: ${r.join(',')}`);
    else if (bx < 1 || by < 1) errors.push(`hueco ${r.join(',')} toca una pared del fondo (x = 0 o y = 0)`);
    else if (bx + bw > W || by + bh > H) errors.push(`hueco ${r.join(',')} se sale de la sala`);
  }
  if (errors.length) return errors;
  const blocked = roomBlockedCells(room);
  const free: string[] = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (!blocked.has(`${x},${y}`)) free.push(`${x},${y}`);
  if (!free.length) return ['la sala no tiene suelo'];
  const seen = new Set([free[0]]);
  const queue = [free[0]];
  while (queue.length) {
    const [x, y] = queue.pop()!.split(',').map(Number);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const k = `${nx},${ny}`;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !blocked.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  if (seen.size !== free.length) errors.push('el suelo queda partido en zonas sin conexión');
  if (!findFreePlacement(room, { footprint: maxFootprint, mount: 'floor' }, [])) {
    errors.push(`no cabe una huella de ${maxFootprint[0]}×${maxFootprint[1]}`);
  }
  return errors;
}
