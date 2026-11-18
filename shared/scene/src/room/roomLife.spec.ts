import { describe, expect, it } from 'vitest';
import habitats from '../../../game-data/habitats.json';
import { roomBlockedCells, type BlockedRect } from '../iso/layout';
import { skyAt } from '../ambience/sunClock';
import { applyWeather, lookFromWmo } from '../ambience/weather';
import { activeKinds, FURNITURE_LIGHTS, lampLevel } from './roomLife';
import { styleFor } from './roomStyles';
import { blockedOf } from './roomShape';

type CatalogRoom = { id: string; gridWidth: number; gridHeight: number; blocked?: BlockedRect[] };
const rooms = habitats.rooms as unknown as CatalogRoom[];
const clear = lookFromWmo(0, 18);
const rain = lookFromWmo(63, 12);
const noon = applyWeather(skyAt(13 * 60), clear);
const midnight = applyWeather(skyAt(0), clear);

describe('roomLife', () => {
  it('las lámparas se encienden de noche, se apagan a mediodía y bajan si el Pockai duerme', () => {
    expect(lampLevel(noon, clear, false)).toBe(0);
    expect(lampLevel(midnight, clear, false)).toBe(1);
    expect(lampLevel(midnight, clear, true)).toBeCloseTo(0.3);
    // Un día de tormenta oscuro enciende algo las luces
    expect(lampLevel(applyWeather(skyAt(13 * 60), rain), rain, false)).toBeGreaterThan(0);
    expect(lampLevel(null, null, false)).toBe(0);
  });

  it('cada partícula sale cuando toca según la hora y el clima', () => {
    const garden = styleFor('jardin').life!;
    expect(activeKinds(garden, noon, clear)).toEqual(['butterfly', 'leaf']);
    expect(activeKinds(garden, midnight, clear)).toEqual(['firefly', 'leaf']);
    expect(activeKinds(garden, applyWeather(skyAt(0), rain), rain)).toEqual(['leaf']);
    const snow = lookFromWmo(73, -2);
    expect(activeKinds(garden, applyWeather(skyAt(13 * 60), snow), snow)).toEqual([]);
    expect(activeKinds(styleFor('sala').life!, midnight, clear)).toEqual([]);
  });

  it('todas las salas tienen luces y vida, y sus luces caen dentro de la sala', () => {
    for (const r of rooms) {
      const style = styleFor(r.id);
      const holes = roomBlockedCells({ ...r, blocked: blockedOf(r) });
      expect(style.life?.length, r.id).toBeGreaterThan(0);
      const glows = style.glows?.(r.gridWidth, r.gridHeight, holes) ?? [];
      expect(glows.length, r.id).toBeGreaterThan(0);
      const halfW = (r.gridWidth + r.gridHeight) * 16;
      for (const gl of glows) {
        expect(Math.abs(gl.x), r.id).toBeLessThan(halfW);
        expect(gl.y, r.id).toBeGreaterThan(-140);
        expect(gl.y, r.id).toBeLessThan((r.gridWidth + r.gridHeight) * 8);
      }
    }
  });

  it('las luces de muebles apuntan a muebles que existen en el catálogo', () => {
    const ids = new Set(habitats.furniture.map((f) => f.id));
    for (const id of Object.keys(FURNITURE_LIGHTS)) expect(ids.has(id), id).toBe(true);
  });
});
