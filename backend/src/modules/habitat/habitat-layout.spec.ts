import {
  findFreePlacement,
  footprintCells,
  normalizeRotation,
  repairRoom,
  rotatedFootprint,
  validatePlacement,
  type PlacedShape,
} from './habitat-layout';

const room = { gridWidth: 14, gridHeight: 10 };
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
});
