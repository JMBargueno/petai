/**
 * Guion de las escenas entre el Pockai de la sala y el que viene de visita.
 *
 * Qué escena toca lo decide el servidor (`backend/src/modules/mind/social.engine.ts`), con las
 * dos personalidades y su relación. Aquí solo está cómo se representa: una lista de tiempos en la
 * que cada uno se mueve, mira al otro y reproduce un clip. Sin arte nuevo: solo clips que ya existen.
 *
 * Funciones puras; la sala (`IsoRoom`) es quien mueve los sprites.
 */
import type { Cell } from '../iso/pathfind';

export const VISIT_SCENES = ['greet', 'explore_together', 'play_tag', 'share_food', 'nap_together', 'squabble', 'make_up'] as const;
export type VisitSceneType = (typeof VISIT_SCENES)[number];

export function isVisitScene(v: unknown): v is VisitSceneType {
  return typeof v === 'string' && (VISIT_SCENES as readonly string[]).includes(v);
}

/**
 * Cómo se mueve un actor en un tiempo de la escena:
 * - `stay`: se queda donde está.
 * - `meet`: va junto al otro (que se queda quieto).
 * - `roam`: va a una celda libre algo alejada.
 * - `follow`: va junto al destino del otro (que hace `roam`).
 */
export type Move = 'stay' | 'meet' | 'roam' | 'follow';

export interface ActorStep {
  move: Move;
  /** Hacia dónde mira al llegar. */
  face?: 'other' | 'away';
  /** Clip de acción que reproduce una vez al llegar. */
  clip?: string;
  /** Clip de reposo que mantiene mientras dura el tiempo (p. ej. dormir). */
  hold?: string;
}

export interface Beat {
  host: ActorStep;
  guest: ActorStep;
  /** Cuánto dura el tiempo una vez que los dos han llegado. */
  holdMs: number;
}

const SCRIPTS: Record<VisitSceneType, Beat[]> = {
  // Se presentan: el visitante se acerca y se saludan
  greet: [
    { host: { move: 'stay', face: 'other', clip: 'happy' }, guest: { move: 'meet', face: 'other', clip: 'happy' }, holdMs: 1800 },
    { host: { move: 'stay', face: 'other', clip: 'idle_alt' }, guest: { move: 'stay', face: 'other', clip: 'idle_alt' }, holdMs: 1200 },
  ],
  // El anfitrión enseña su sala y el visitante le sigue
  explore_together: [
    { host: { move: 'roam', clip: 'idle_alt' }, guest: { move: 'follow', face: 'other', clip: 'idle_alt' }, holdMs: 1400 },
    { host: { move: 'roam', clip: 'idle_alt' }, guest: { move: 'follow', face: 'other', clip: 'happy' }, holdMs: 1400 },
  ],
  // Pilla-pilla: se persiguen por turnos
  play_tag: [
    { host: { move: 'follow', face: 'other' }, guest: { move: 'roam', clip: 'happy' }, holdMs: 700 },
    { host: { move: 'roam', clip: 'happy' }, guest: { move: 'follow', face: 'other' }, holdMs: 700 },
    { host: { move: 'follow', face: 'other', clip: 'happy' }, guest: { move: 'roam', clip: 'happy' }, holdMs: 1000 },
  ],
  share_food: [
    { host: { move: 'stay', face: 'other', clip: 'eat' }, guest: { move: 'meet', face: 'other', clip: 'eat' }, holdMs: 2400 },
    { host: { move: 'stay', face: 'other', clip: 'love' }, guest: { move: 'stay', face: 'other', clip: 'happy' }, holdMs: 1500 },
  ],
  nap_together: [
    { host: { move: 'stay', hold: 'sleep' }, guest: { move: 'meet', hold: 'sleep' }, holdMs: 7000 },
    { host: { move: 'stay', clip: 'wake' }, guest: { move: 'stay', clip: 'wake' }, holdMs: 1500 },
  ],
  // Un pique: se encaran y luego cada uno mira para otro lado
  squabble: [
    { host: { move: 'stay', face: 'other', clip: 'attack' }, guest: { move: 'meet', face: 'other', clip: 'surprised' }, holdMs: 1300 },
    { host: { move: 'stay', face: 'away', hold: 'sad' }, guest: { move: 'roam', face: 'away', hold: 'sad' }, holdMs: 2600 },
  ],
  make_up: [
    { host: { move: 'stay', face: 'other', clip: 'love' }, guest: { move: 'meet', face: 'other', clip: 'love' }, holdMs: 2200 },
    { host: { move: 'stay', face: 'other', clip: 'happy' }, guest: { move: 'stay', face: 'other', clip: 'happy' }, holdMs: 1200 },
  ],
};

/** Tiempos de una escena (vacío si el tipo no se conoce: una app antigua ante un servidor nuevo). */
export function scriptFor(type: string): Beat[] {
  return isVisitScene(type) ? SCRIPTS[type] : [];
}

/** Clips que usa algún guion (para comprobar que existen en las hojas de animación). */
export function clipsUsed(): string[] {
  const out = new Set<string>();
  for (const beats of Object.values(SCRIPTS)) {
    for (const b of beats) {
      for (const step of [b.host, b.guest]) {
        if (step.clip) out.add(step.clip);
        if (step.hold) out.add(step.hold);
      }
    }
  }
  return [...out].sort();
}

export interface Grid {
  gridWidth: number;
  gridHeight: number;
}

const key = (c: Cell) => `${c.x},${c.y}`;
const inGrid = (c: Cell, g: Grid) => c.x >= 0 && c.y >= 0 && c.x < g.gridWidth && c.y < g.gridHeight;
const dist2 = (a: Cell, b: Cell) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * Vecinas de una celda, por orden de preferencia para ponerse al lado de alguien:
 * 1. Las dos que en pantalla quedan a su misma altura, a izquierda y derecha (en la rejilla son
 *    diagonales): los dos se ven enteros, uno junto al otro.
 * 2. Las cuatro contiguas: cerca, pero el de delante tapa en parte al de detrás.
 * 3. Las otras dos diagonales: justo delante o detrás, donde más se tapan.
 */
const NEIGHBORS: { cell: Cell; rank: number }[] = [
  { cell: { x: 1, y: -1 }, rank: 0 },
  { cell: { x: -1, y: 1 }, rank: 0 },
  { cell: { x: 1, y: 0 }, rank: 1 },
  { cell: { x: 0, y: 1 }, rank: 1 },
  { cell: { x: -1, y: 0 }, rank: 1 },
  { cell: { x: 0, y: -1 }, rank: 1 },
  { cell: { x: 1, y: 1 }, rank: 2 },
  { cell: { x: -1, y: -1 }, rank: 2 },
];

/**
 * Celda libre junto a `cell` donde colocarse para estar al lado. Elige por la preferencia de
 * `NEIGHBORS` y, a igualdad, la más cercana a `from` (para no dar la vuelta). `null` si la celda
 * está rodeada.
 */
export function freeNeighbor(cell: Cell, blocked: ReadonlySet<string>, grid: Grid, from: Cell): Cell | null {
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (const n of NEIGHBORS) {
    const c = { x: cell.x + n.cell.x, y: cell.y + n.cell.y };
    if (!inGrid(c, grid) || blocked.has(key(c))) continue;
    const score = n.rank * 10_000 + dist2(c, from);
    if (score < bestScore) [best, bestScore] = [c, score];
  }
  return best;
}

/**
 * Celda libre a cierta distancia de `from`, para pasear o salir corriendo. Hace varios intentos
 * con el generador recibido; `null` si no encuentra ninguna.
 */
export function roamCell(from: Cell, blocked: ReadonlySet<string>, grid: Grid, rng: () => number, minDist = 3, reach = 5): Cell | null {
  for (let tries = 0; tries < 24; tries++) {
    const c = {
      x: Math.max(0, Math.min(grid.gridWidth - 1, from.x + Math.round((rng() - 0.5) * 2 * reach))),
      y: Math.max(0, Math.min(grid.gridHeight - 1, from.y + Math.round((rng() - 0.5) * 2 * reach))),
    };
    // En los últimos intentos se conforma con cualquier celda libre distinta de la suya
    const far = tries < 16 ? dist2(c, from) >= minDist * minDist : dist2(c, from) > 0;
    if (far && !blocked.has(key(c))) return c;
  }
  return null;
}

/** Por dónde entra el visitante: la celda libre más cercana a la esquina delantera de la sala. */
export function entranceCell(blocked: ReadonlySet<string>, grid: Grid): Cell {
  const door = { x: grid.gridWidth - 1, y: grid.gridHeight - 1 };
  let best: Cell = door;
  let bestD = Infinity;
  for (let x = 0; x < grid.gridWidth; x++) {
    for (let y = 0; y < grid.gridHeight; y++) {
      if (blocked.has(`${x},${y}`)) continue;
      const d = dist2({ x, y }, door);
      if (d < bestD) [best, bestD] = [{ x, y }, d];
    }
  }
  return best;
}
