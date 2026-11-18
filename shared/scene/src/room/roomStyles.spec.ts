import { describe, expect, it } from 'vitest';
import habitats from '../../../game-data/habitats.json';
import { roomBlockedCells, roomShapeErrors, validatePlacement, type BlockedRect } from '../iso/layout';
import { demoRoom } from '../embed/demoRoom';
import { cellHash, openHoles, styleFor } from './roomStyles';
import { blockedOf } from './roomShape';

type CatalogRoom = { id: string; gridWidth: number; gridHeight: number; blocked?: BlockedRect[] };
const rooms = habitats.rooms as unknown as CatalogRoom[];
const furniture = habitats.furniture as unknown as { id: string; room: string; footprint?: [number, number]; mount?: string }[];

describe('roomStyles', () => {
  it('da a cada sala del catálogo su propio diseño', () => {
    const ids = habitats.rooms.map((r) => styleFor(r.id).id);
    expect(ids).toEqual(['interior', 'garden', 'shrine', 'celestial']);
    expect(new Set(ids).size).toBe(habitats.rooms.length);
  });

  it('usa el interior clásico con salas desconocidas', () => {
    expect(styleFor('sala_de_un_mod').id).toBe('interior');
    expect(styleFor(undefined).id).toBe('interior');
  });

  it('cellHash es determinista, está en [0, 1) y varía entre celdas', () => {
    const vals = new Set<number>();
    for (let x = 0; x < 14; x++) {
      for (let y = 0; y < 10; y++) {
        const h = cellHash(x, y, 7);
        expect(h).toBe(cellHash(x, y, 7));
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        vals.add(h);
      }
    }
    expect(vals.size).toBeGreaterThan(130);
    expect(cellHash(3, 4, 1)).not.toBe(cellHash(3, 4, 2));
  });

  it('las estrellas que titilan son estables entre redibujados', () => {
    const s = styleFor('citafinal');
    const none = new Set<string>();
    expect(s.twinkles?.(14, 10, none)).toEqual(s.twinkles?.(14, 10, none));
    expect(s.twinkles?.(14, 10, none).length).toBeGreaterThan(0);
  });

  it('el estanque del jardín brilla', () => {
    const garden = rooms.find((r) => r.id === 'jardin')!;
    expect(styleFor('jardin').twinkles?.(14, 10, roomBlockedCells(garden)).length).toBeGreaterThan(0);
  });
});

describe('forma de las salas', () => {
  it('cada sala tiene una forma válida para sus muebles', () => {
    for (const r of rooms) {
      const own = furniture.filter((f) => f.room === r.id && f.mount !== 'wall').map((f) => f.footprint ?? ([1, 1] as [number, number]));
      const biggest = own.reduce((a, f) => (f[0] * f[1] > a[0] * a[1] ? f : a), [1, 1] as [number, number]);
      expect([r.id, roomShapeErrors(r, biggest)]).toEqual([r.id, []]);
    }
  });

  it('las cuatro formas son distintas y ninguna es el rectángulo entero', () => {
    const shapes = rooms.map((r) => [...roomBlockedCells(r)].sort().join(' '));
    expect(shapes.every((s) => s.length > 0)).toBe(true);
    expect(new Set(shapes).size).toBe(rooms.length);
  });

  it('el refugio bajo el árbol del jardín queda libre', () => {
    const holes = roomBlockedCells(rooms.find((r) => r.id === 'jardin')!);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) expect(holes.has(`${x},${y}`)).toBe(false);
  });

  it('distingue fosos (estanque) de huecos que dan al borde', () => {
    const garden = rooms.find((r) => r.id === 'jardin')!;
    const holes = roomBlockedCells(garden);
    const open = openHoles(14, 10, holes);
    expect(open.has('9,4')).toBe(false); // estanque
    expect(open.has('13,9')).toBe(true); // mordisco del borde
    expect(openHoles(14, 10, roomBlockedCells(rooms[0])).size).toBe(roomBlockedCells(rooms[0]).size);
  });

  it('usa la forma del catálogo si el anfitrión no la manda', () => {
    expect(blockedOf({ id: 'sala' })).toEqual(rooms[0].blocked);
    expect(blockedOf({ id: 'sala', blocked: [] })).toEqual([]);
    expect(blockedOf({ id: 'sala_de_un_mod' })).toEqual([]);
  });

  it('los muebles de ejemplo del demo no caen en huecos', () => {
    for (const r of rooms) {
      const room = demoRoom(r.id);
      for (const it of room.items) {
        const def = room.furniture.find((f) => f.id === it.furnitureId)!;
        expect([it.id, validatePlacement({ ...room, blocked: blockedOf(room) }, def, it, [])]).toEqual([it.id, null]);
      }
    }
  });
});
