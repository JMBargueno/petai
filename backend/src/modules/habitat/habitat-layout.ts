/**
 * Geometría de la rejilla del hábitat isométrico (GUIA_ARTISTICA §7.4). Funciones puras: sin
 * Prisma ni Nest, para poder testearlas y reutilizarlas en la reparación de salas.
 *
 * Convenciones:
 *  - La sala es una rejilla `gridWidth × gridHeight`; `(x, y)` es la celda ancla del mueble.
 *  - `footprint` = `[ancho (x), fondo (y)]` con rotación 0. Con rotación 1 y 3 se intercambia.
 *  - Muebles de suelo (`floor`) ocupan celdas del suelo y chocan entre sí.
 *  - Muebles de pared (`wall`) no ocupan suelo (debajo puede ir otro mueble): solo chocan con otros
 *    de pared. Van pegados a la pared del fondo-derecha (`y = 0`, rotación par) o a la del fondo-izquierda (`x = 0`,
 *    rotación impar).
 */
export type Mount = 'floor' | 'wall';
export type Rotation = 0 | 1 | 2 | 3;

export interface RoomGrid {
  gridWidth: number;
  gridHeight: number;
}

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
  /** Identificador del item (para ignorarlo al moverlo). */
  id?: string;
}

export function normalizeRotation(rotation: number | undefined): Rotation {
  const r = Math.trunc(rotation ?? 0);
  return (((r % 4) + 4) % 4) as Rotation;
}

/** Huella `[ancho, fondo]` ya girada. */
export function rotatedFootprint(shape: FurnitureShape, rotation: number): [number, number] {
  const [w, d] = shape.footprint ?? [1, 1];
  return normalizeRotation(rotation) % 2 === 0 ? [w, d] : [d, w];
}

/** Celdas `"x,y"` que ocupa un mueble colocado. */
export function footprintCells(shape: FurnitureShape, p: Placement): string[] {
  const [w, d] = rotatedFootprint(shape, p.rotation);
  const cells: string[] = [];
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < d; dy++) cells.push(`${p.x + dx},${p.y + dy}`);
  return cells;
}

export type PlacementError = 'out_of_bounds' | 'not_on_wall' | 'collision';

/**
 * Comprueba si `shape` cabe en `p` dentro de la sala sin chocar con `others`.
 * Devuelve `null` si es válida o el motivo del rechazo.
 */
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
  for (const o of others) {
    if ((o.mount ?? 'floor') !== mount) continue;
    if (footprintCells(o, o).some((c) => mine.has(c))) return 'collision';
  }
  return null;
}

/**
 * Primer hueco válido para `shape`, recorriendo la rejilla en el mismo orden que antes
 * (x, luego y) y probando rotación 0 y después 1. `null` si no cabe en ningún sitio.
 */
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

/**
 * Reparación de una sala: conserva en su sitio los muebles válidos (por orden de compra) y
 * recoloca en el primer hueco libre los que no lo son (p. ej. datos anteriores a las huellas).
 * Devuelve solo los cambios; un mueble que no quepa en ningún sitio se queda donde está
 * (`unplaceable`) para no perderlo.
 */
export function repairRoom<T extends PlacedShape & { id: string }>(
  room: RoomGrid,
  items: T[],
): { moved: { id: string; to: Placement }[]; unplaceable: string[] } {
  const kept: PlacedShape[] = [];
  const pending: T[] = [];
  for (const it of items) {
    const p = { x: it.x, y: it.y, rotation: normalizeRotation(it.rotation) };
    if (validatePlacement(room, it, p, kept) === null) kept.push({ ...it, ...p });
    else pending.push(it);
  }
  const moved: { id: string; to: Placement }[] = [];
  const unplaceable: string[] = [];
  for (const it of pending) {
    const to = findFreePlacement(room, it, kept);
    if (to) {
      kept.push({ ...it, ...to });
      moved.push({ id: it.id, to });
    } else {
      unplaceable.push(it.id);
    }
  }
  return { moved, unplaceable };
}
