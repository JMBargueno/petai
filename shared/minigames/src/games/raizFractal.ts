import { createRng, shuffle } from '../core/rng';
import { randInt, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Raíz Fractal (Planta): rejilla de piezas de raíz (recta, codo, T). Se giran para llevar la savia
 * desde la semilla (borde izquierdo) hasta el borde derecho. Al conectar, la raíz florece y llega
 * otro tablero más grande (4×4 → 5×5 → 6×6).
 *
 * Techo: 5 puntos por tablero; entre tablero y tablero hay 1,5 s de floración en los que no se
 * puede girar → como mucho 5 / 1,5 = 3,3 pt/s < 4.
 * Variante accesible: la vista resalta la siguiente pieza mal girada del camino.
 */
export const RAIZ = {
  SIZES: [4, 5, 6] as readonly number[],
  POINTS: 5,
  BLOOM_TICKS: secondsToTicks(1.5),
  ROTATE_TICKS: 8,
} as const;

/** Conexiones por bits: N=1, E=2, S=4, W=8. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
];
const STRAIGHT = N | S;
const ELBOW = N | E;
const TEE = N | E | S;

/** Gira una pieza 90° en sentido horario. */
export const rotateMask = (m: number) => ((m << 1) | (m >> 3)) & 15;
const rotateTimes = (m: number, k: number) => {
  for (let i = 0; i < k; i++) m = rotateMask(m);
  return m;
};

export interface RaizBoard {
  size: number;
  /** Piezas actuales (bits de conexión), fila a fila. */
  cells: number[];
  /** Piezas del camino resuelto (−1 si la casilla no es del camino). */
  solution: number[];
  sourceRow: number;
}

export interface RaizState {
  rng: () => number;
  durationTicks: number;
  tick: number;
  hints: boolean;
  board: RaizBoard;
  boards: number;
  /** Casillas por las que ya corre la savia. */
  lit: boolean[];
  /** Hasta este tick el tablero florece y no admite giros. */
  bloomUntil: number;
  cooldownUntil: number;
  score: number;
  rotations: number;
}

export type RaizInput = { kind: 'rotate'; i: number };

const R = RAIZ;

/** Camino aleatorio sin cruces desde (0, fila) hasta cualquier casilla de la última columna. */
function randomPath(rng: () => number, size: number, row: number): [number, number][] {
  const seen = new Set<number>();
  const path: [number, number][] = [];
  const dfs = (x: number, y: number): boolean => {
    seen.add(y * size + x);
    path.push([x, y]);
    if (x === size - 1) return true;
    // Orden aleatorio con Fisher-Yates (nunca `sort` con comparador aleatorio: cada motor JS lo
    // resuelve distinto y la partida dejaría de ser reproducible). Con 60 %, avanzar a la derecha
    // va primero, para que los caminos no sean eternos.
    const order = shuffle(DIRS, rng);
    if (rng() < 0.6) order.sort((a, b) => b.dx - a.dx);
    for (const d of order) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen.has(ny * size + nx)) continue;
      if (dfs(nx, ny)) return true;
    }
    path.pop();
    return false;
  };
  dfs(0, row);
  return path;
}

function buildBoard(rng: () => number, size: number): RaizBoard {
  const sourceRow = randInt(rng, size);
  const path = randomPath(rng, size, sourceRow);
  const solution = new Array<number>(size * size).fill(-1);
  path.forEach(([x, y], k) => {
    let mask = 0;
    const prev = k === 0 ? [x - 1, y] : path[k - 1];
    const next = k === path.length - 1 ? [x + 1, y] : path[k + 1];
    for (const [px, py] of [prev, next]) {
      const d = DIRS.find((dd) => dd.dx === px - x && dd.dy === py - y)!;
      mask |= d.bit;
    }
    solution[y * size + x] = mask;
  });
  const cells = solution.map((m) => {
    if (m >= 0) return rotateTimes(m, 1 + randInt(rng, 3));
    const kinds = [STRAIGHT, ELBOW, ELBOW, TEE];
    return rotateTimes(kinds[randInt(rng, kinds.length)], randInt(rng, 4));
  });
  return { size, cells, solution, sourceRow };
}

/** Casillas alcanzadas por la savia y si llega al borde derecho. */
export function flow(board: RaizBoard): { lit: boolean[]; solved: boolean } {
  const { size, cells, sourceRow } = board;
  const lit = new Array<boolean>(size * size).fill(false);
  const start = sourceRow * size;
  if (!(cells[start] & W)) return { lit, solved: false };
  const queue = [start];
  lit[start] = true;
  let solved = false;
  while (queue.length) {
    const i = queue.shift()!;
    const x = i % size;
    const y = Math.floor(i / size);
    if (x === size - 1 && cells[i] & E) solved = true;
    for (const d of DIRS) {
      if (!(cells[i] & d.bit)) continue;
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (lit[j] || !(cells[j] & d.opp)) continue;
      lit[j] = true;
      queue.push(j);
    }
  }
  return { lit, solved };
}

/** Una casilla del camino está bien girada (una recta vale en sus dos orientaciones equivalentes). */
export const cellMatches = (board: RaizBoard, i: number) => {
  const sol = board.solution[i];
  return sol < 0 || board.cells[i] === sol;
};

function nextBoard(s: RaizState) {
  const size = R.SIZES[Math.min(s.boards, R.SIZES.length - 1)];
  let board = buildBoard(s.rng, size);
  // Nunca un tablero ya resuelto.
  while (flow(board).solved) board = buildBoard(s.rng, size);
  s.board = board;
  s.lit = flow(board).lit;
}

export const raizFractal: GameDefinition<RaizState, RaizInput> = {
  id: 'raiz_fractal',
  inputKeys: { rotate: ['i'] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const s: RaizState = {
      rng: createRng(seed),
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      hints: variant === 'easy',
      board: { size: 0, cells: [], solution: [], sourceRow: 0 },
      boards: 0,
      lit: [],
      bloomUntil: -1,
      cooldownUntil: -1,
      score: 0,
      rotations: 0,
    };
    nextBoard(s);
    return s;
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'rotate' && Number.isInteger(r.i) && (r.i as number) >= 0 && (r.i as number) < 36) return { kind: 'rotate', i: r.i as number };
    return null;
  },
  input(s, { i }) {
    if (s.tick < s.bloomUntil || s.tick < s.cooldownUntil || i >= s.board.cells.length) return;
    s.board.cells[i] = rotateMask(s.board.cells[i]);
    s.rotations += 1;
    s.cooldownUntil = s.tick + R.ROTATE_TICKS;
    const f = flow(s.board);
    s.lit = f.lit;
    if (f.solved) {
      s.score += R.POINTS;
      s.boards += 1;
      s.bloomUntil = s.tick + R.BLOOM_TICKS;
    }
  },
  step(s) {
    if (s.bloomUntil >= 0 && s.tick + 1 === s.bloomUntil) nextBoard(s);
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
