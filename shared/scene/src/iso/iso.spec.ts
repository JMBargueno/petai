import { describe, expect, it } from 'vitest';
import { depthOf, toGrid, toScreen } from './projection';
import { footprintCells, rotatedFootprint, snapToWall, validatePlacement } from './layout';
import { findPath } from './pathfind';

const room = { gridWidth: 14, gridHeight: 10 };

describe('proyección', () => {
  it('toScreen y toGrid son inversas', () => {
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [13.5, 9.25],
    ]) {
      const s = toScreen(x, y);
      const g = toGrid(s.x, s.y);
      expect(g.gx).toBeCloseTo(x);
      expect(g.gy).toBeCloseTo(y);
    }
    expect(toScreen(1, 0)).toEqual({ x: 16, y: 8 });
    expect(toScreen(0, 1)).toEqual({ x: -16, y: 8 });
    expect(toScreen(0, 0, 10)).toEqual({ x: 0, y: -10 });
  });

  it('lo que está más abajo en pantalla va delante', () => {
    expect(depthOf(2, 2)).toBeGreaterThan(depthOf(1, 2));
  });
});

describe('layout (mismo contrato que el backend)', () => {
  const bed = { footprint: [2, 1] as [number, number] };
  const shelf = { footprint: [2, 1] as [number, number], mount: 'wall' as const };
  it('huella girada y celdas', () => {
    expect(rotatedFootprint(bed, 1)).toEqual([1, 2]);
    expect(footprintCells(bed, { x: 1, y: 1, rotation: 0 })).toEqual(['1,1', '2,1']);
  });
  it('valida límites, pared y colisiones', () => {
    expect(validatePlacement(room, bed, { x: 13, y: 0, rotation: 0 }, [])).toBe('out_of_bounds');
    expect(validatePlacement(room, shelf, { x: 2, y: 3, rotation: 0 }, [])).toBe('not_on_wall');
    expect(validatePlacement(room, shelf, snapToWall({ x: 2, y: 3, rotation: 0 }), [])).toBeNull();
    expect(validatePlacement(room, bed, { x: 0, y: 0, rotation: 0 }, [{ ...bed, x: 1, y: 0, rotation: 1 }])).toBe('collision');
  });
});

describe('A*', () => {
  it('rodea obstáculos sin cortar esquinas', () => {
    const blocked = new Set(['1,0', '1,1', '1,2']);
    const path = findPath({ gridWidth: 4, gridHeight: 4 }, blocked, { x: 0, y: 0 }, { x: 2, y: 0 })!;
    expect(path.at(-1)).toEqual({ x: 2, y: 0 });
    for (const c of path) expect(blocked.has(`${c.x},${c.y}`)).toBe(false);
    // Debe pasar por debajo de la pared (y = 3).
    expect(path.some((c) => c.y === 3)).toBe(true);
  });
  it('null si no hay camino; permite pisar las celdas autorizadas', () => {
    const blocked = new Set(['1,0', '1,1']);
    expect(findPath({ gridWidth: 2, gridHeight: 2 }, blocked, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(findPath({ gridWidth: 2, gridHeight: 2 }, blocked, { x: 0, y: 0 }, { x: 1, y: 1 }, new Set(['1,1']))).not.toBeNull();
  });
});
