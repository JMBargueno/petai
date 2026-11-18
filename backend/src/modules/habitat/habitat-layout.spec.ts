import { readFileSync } from 'fs';
import { join } from 'path';
import {
  findFreePlacement,
  footprintCells,
  normalizeRotation,
  repairRoom,
  roomBlockedCells,
  roomShapeErrors,
  rotatedFootprint,
  validatePlacement,
  type PlacedShape,
} from './habitat-layout';

const room = { gridWidth: 14, gridHeight: 10 };
const habitats = JSON.parse(readFileSync(join(__dirname, '../../../../shared/game-data/habitats.json'), 'utf8'));
const bed = { footprint: [2, 1] as [number, number], mount: 'floor' as const };
const pond = { footprint: [2, 2] as [number, number], mount: 'floor' as const };
const shelf = { footprint: [2, 1] as [number, number], mount: 'wall' as const };
const ball = { footprint: [1, 1] as [number, number], mount: 'floor' as const };

describe('habitat-layout', () => {
  it('normaliza la rotación a 0..3', () => {
    expect([0, 1, 4, 5, -1, 2.7].map(normalizeRotation)).toEqual([0, 1, 0, 1, 3, 2]);
  });

  it('gira la huella con rotación impar', () => {
    expect(rotatedFootprint(bed, 0)).toEqual([2, 1]);
    expect(rotatedFootprint(bed, 1)).toEqual([1, 2]);
    expect(rotatedFootprint(bed, 2)).toEqual([2, 1]);
    expect(rotatedFootprint({}, 3)).toEqual([1, 1]); // sin huella → 1×1
  });

  it('lista las celdas ocupadas', () => {
    expect(footprintCells(bed, { x: 3, y: 4, rotation: 0 })).toEqual(['3,4', '4,4']);
    expect(footprintCells(bed, { x: 3, y: 4, rotation: 1 })).toEqual(['3,4', '3,5']);
    expect(footprintCells(pond, { x: 0, y: 0, rotation: 0 })).toHaveLength(4);
  });

  describe('validatePlacement', () => {
    it('rechaza lo que se sale de la sala (también al girar)', () => {
      expect(validatePlacement(room, bed, { x: 13, y: 0, rotation: 0 }, [])).toBe('out_of_bounds');
      expect(validatePlacement(room, bed, { x: 13, y: 0, rotation: 1 }, [])).toBeNull();
      expect(validatePlacement(room, bed, { x: 0, y: 9, rotation: 1 }, [])).toBe('out_of_bounds');
      expect(validatePlacement(room, ball, { x: -1, y: 0, rotation: 0 }, [])).toBe('out_of_bounds');
    });

    it('detecta colisiones entre muebles de suelo con huella', () => {
      const others: PlacedShape[] = [{ ...pond, x: 4, y: 4, rotation: 0 }];
      expect(validatePlacement(room, bed, { x: 3, y: 5, rotation: 0 }, others)).toBe('collision');
      expect(validatePlacement(room, bed, { x: 2, y: 5, rotation: 0 }, others)).toBeNull();
    });

    it('los de pared van contra la pared y no chocan con el suelo', () => {
      expect(validatePlacement(room, shelf, { x: 3, y: 0, rotation: 0 }, [])).toBeNull();
      expect(validatePlacement(room, shelf, { x: 3, y: 2, rotation: 0 }, [])).toBe('not_on_wall');
      expect(validatePlacement(room, shelf, { x: 0, y: 5, rotation: 1 }, [])).toBeNull();
      expect(validatePlacement(room, shelf, { x: 0, y: 5, rotation: 0 }, [])).toBe('not_on_wall');
      // Debajo de la estantería puede haber un mueble de suelo, pero no otra estantería.
      const floorBelow: PlacedShape[] = [{ ...bed, x: 3, y: 0, rotation: 0 }];
      expect(validatePlacement(room, shelf, { x: 3, y: 0, rotation: 0 }, floorBelow)).toBeNull();
      const otherShelf: PlacedShape[] = [{ ...shelf, x: 4, y: 0, rotation: 0 }];
      expect(validatePlacement(room, shelf, { x: 3, y: 0, rotation: 0 }, otherShelf)).toBe('collision');
    });
  });

  it('findFreePlacement recorre x y luego y, y prueba a girar si no cabe', () => {
    expect(findFreePlacement(room, bed, [])).toEqual({ x: 0, y: 0, rotation: 0 });
    // Pasillo de 1 de ancho: la cama solo cabe girada.
    const narrow = { gridWidth: 1, gridHeight: 4 };
    expect(findFreePlacement(narrow, bed, [])).toEqual({ x: 0, y: 0, rotation: 1 });
    const full = { gridWidth: 1, gridHeight: 1 };
    expect(findFreePlacement(full, bed, [])).toBeNull();
  });

  it('repairRoom conserva los válidos y recoloca los que se solapan o no están en la pared', () => {
    // Datos antiguos: todo en la columna x = 0 (una celda por mueble).
    const items = [
      { id: 'a', ...ball, x: 0, y: 0, rotation: 0 },
      { id: 'b', ...bed, x: 0, y: 1, rotation: 0 }, // ocupa 0,1 y 1,1: válido
      { id: 'c', ...ball, x: 0, y: 1, rotation: 0 }, // choca con la cama
      { id: 'd', ...shelf, x: 0, y: 3, rotation: 0 }, // de pared pero no en y = 0
    ];
    const { moved, unplaceable } = repairRoom(room, items);
    expect(unplaceable).toEqual([]);
    expect(moved.map((m) => m.id).sort()).toEqual(['c', 'd']);
    const shelfTo = moved.find((m) => m.id === 'd')!.to;
    expect(validatePlacement(room, shelf, shelfTo, [])).toBeNull();
    expect(repairRoom(room, [{ id: 'a', ...ball, x: 0, y: 0, rotation: 0 }]).moved).toEqual([]);
  });

  describe('forma de la sala (celdas sin suelo)', () => {
    const shaped = { gridWidth: 14, gridHeight: 10, blocked: [[10, 7, 4, 3]] as [number, number, number, number][] };

    it('lista las celdas del hueco', () => {
      const cells = roomBlockedCells(shaped);
      expect(cells.size).toBe(12);
      expect(cells.has('10,7')).toBe(true);
      expect(cells.has('9,7')).toBe(false);
      expect(roomBlockedCells({}).size).toBe(0);
    });

    it('no deja un mueble de suelo sobre el hueco, pero sí junto a él', () => {
      expect(validatePlacement(shaped, bed, { x: 9, y: 7, rotation: 0 }, [])).toBe('out_of_bounds');
      expect(validatePlacement(shaped, bed, { x: 8, y: 7, rotation: 0 }, [])).toBeNull();
      expect(validatePlacement(shaped, shelf, { x: 12, y: 0, rotation: 0 }, [])).toBeNull();
    });

    it('findFreePlacement y repairRoom saltan los huecos', () => {
      const corner = { gridWidth: 3, gridHeight: 3, blocked: [[1, 1, 2, 2]] as [number, number, number, number][] };
      expect(findFreePlacement(corner, pond, [])).toBeNull();
      expect(findFreePlacement(corner, bed, [{ ...ball, x: 0, y: 0, rotation: 0 }])).toEqual({ x: 1, y: 0, rotation: 0 });
      const { moved } = repairRoom(shaped, [{ id: 'z', ...ball, x: 12, y: 8, rotation: 0 }]);
      expect(moved).toHaveLength(1);
      expect(validatePlacement(shaped, ball, moved[0].to, [])).toBeNull();
    });

    it('valida las reglas de forma', () => {
      expect(roomShapeErrors(shaped, [2, 2])).toEqual([]);
      expect(roomShapeErrors({ ...shaped, blocked: [[0, 3, 2, 2]] })[0]).toMatch(/pared del fondo/);
      expect(roomShapeErrors({ ...shaped, blocked: [[12, 9, 3, 1]] })[0]).toMatch(/se sale/);
      // Una columna que no llega a la pared del fondo deja paso por y = 0.
      expect(roomShapeErrors({ ...shaped, blocked: [[5, 1, 1, 9]] })).toEqual([]);
      expect(roomShapeErrors({ gridWidth: 4, gridHeight: 4, blocked: [[1, 2, 3, 1], [2, 1, 1, 1]] })).toEqual([]);
      expect(roomShapeErrors({ gridWidth: 4, gridHeight: 4, blocked: [[2, 1, 1, 3], [3, 1, 1, 1]] })).toContain(
        'el suelo queda partido en zonas sin conexión',
      );
      expect(roomShapeErrors({ gridWidth: 3, gridHeight: 3, blocked: [[1, 1, 2, 2]] }, [2, 2])[0]).toMatch(/no cabe/);
    });

    it('cada sala del catálogo tiene una forma válida y distinta', () => {
      const rooms = habitats.rooms as { id: string; gridWidth: number; gridHeight: number; blocked?: [number, number, number, number][] }[];
      for (const r of rooms) expect([r.id, roomShapeErrors(r, [2, 2])]).toEqual([r.id, []]);
      const shapes = rooms.map((r) => [...roomBlockedCells(r)].sort().join(' '));
      expect(new Set(shapes).size).toBe(rooms.length);
      expect(shapes.every((s) => s.length > 0)).toBe(true);
    });
  });
});
