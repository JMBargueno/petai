import { describe, expect, it } from 'vitest';
import habitats from '../../../game-data/habitats.json';
import { cellHash, styleFor } from './roomStyles';

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
    expect(s.twinkles?.(14, 10)).toEqual(s.twinkles?.(14, 10));
    expect(s.twinkles?.(14, 10).length).toBeGreaterThan(0);
  });
});
