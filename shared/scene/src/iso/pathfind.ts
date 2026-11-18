/**
 * A* en la rejilla de la sala, con 8 direcciones y sin cortar esquinas (no se cuela en diagonal
 * entre dos celdas bloqueadas). Devuelve la lista de celdas desde la siguiente a la de inicio
 * hasta el destino, o `null` si no hay camino.
 */
export interface Cell {
  x: number;
  y: number;
}

const key = (x: number, y: number) => `${x},${y}`;
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function findPath(
  grid: { gridWidth: number; gridHeight: number },
  blocked: Set<string>,
  from: Cell,
  to: Cell,
  /** Celdas bloqueadas que sí se pueden pisar en este viaje (p. ej. la cama a la que va a dormir). */
  allowed: Set<string> = new Set(),
): Cell[] | null {
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < grid.gridWidth && y < grid.gridHeight && (!blocked.has(key(x, y)) || allowed.has(key(x, y)));
  if (!free(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];

  const h = (x: number, y: number) => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const g = new Map<string, number>([[key(from.x, from.y), 0]]);
  const came = new Map<string, string>();
  const open: { x: number; y: number; f: number }[] = [{ x: from.x, y: from.y, f: h(from.x, from.y) }];
  const closed = new Set<string>();

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (cur.x === to.x && cur.y === to.y) {
      const path: Cell[] = [];
      let k: string | undefined = ck;
      while (k && k !== key(from.x, from.y)) {
        const [x, y] = k.split(',').map(Number);
        path.unshift({ x, y });
        k = came.get(k);
      }
      return path;
    }
    if (closed.has(ck)) continue;
    closed.add(ck);
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!free(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!free(cur.x + dx, cur.y) || !free(cur.x, cur.y + dy))) continue;
      const nk = key(nx, ny);
      const ng = (g.get(ck) ?? Infinity) + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}
