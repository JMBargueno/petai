import { describe, expect, it } from 'vitest';
import { nearestFreeCell } from './petHold';

const room = { gridWidth: 6, gridHeight: 5 };

describe('nearestFreeCell', () => {
  it('devuelve la celda bajo el punto si está libre', () => {
    expect(nearestFreeCell(room, new Set(), { gx: 2.3, gy: 3.9 })).toEqual({ x: 2, y: 3 });
  });

  it('si la celda está ocupada por un mueble, busca la libre más cercana', () => {
    const blocked = new Set(['2,3']);
    const c = nearestFreeCell(room, blocked, { gx: 2.5, gy: 3.5 })!;
    expect(blocked.has(`${c.x},${c.y}`)).toBe(false);
    expect(Math.abs(c.x - 2) + Math.abs(c.y - 3)).toBe(1);
  });

  it('un punto fuera de la sala aterriza en el borde más cercano', () => {
    expect(nearestFreeCell(room, new Set(), { gx: 40, gy: -3 })).toEqual({ x: 5, y: 0 });
    expect(nearestFreeCell(room, new Set(), { gx: -2, gy: 2.5 })).toEqual({ x: 0, y: 2 });
  });

  it('sin celdas libres devuelve null', () => {
    const all = new Set<string>();
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) all.add(`${x},${y}`);
    expect(nearestFreeCell({ gridWidth: 2, gridHeight: 2 }, all, { gx: 1, gy: 1 })).toBeNull();
  });
});
