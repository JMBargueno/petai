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
  /** Celdas sin suelo (forma de la sala). */
  blocked?: BlockedRect[] | null;
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
