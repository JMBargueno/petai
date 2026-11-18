import { describe, expect, it } from 'vitest';
import { neutralDims } from '@pockai/mind';
import { newCursorTrack, readCursor, trackCursor } from './deskSense';
import { dimsFromMind, fallbackDims, loadDims, saveDims } from './personalityStore';
import { stepLocomotion } from './locomotion';

const SCREEN = { w: 1600, h: 900 };

describe('seguimiento del cursor', () => {
  it('antes de la primera muestra no está en pantalla', () => {
    expect(readCursor(newCursorTrack(0), 100, SCREEN).onScreen).toBe(false);
  });

  it('mide la velocidad y el sentido horizontal', () => {
    let t = newCursorTrack(0);
    for (let i = 0; i <= 10; i++) t = trackCursor(t, 100 + i * 100, 500, i * 100);
    const c = readCursor(t, 1000, SCREEN);
    expect(c.speed).toBeGreaterThan(900);
    expect(c.vx).toBeGreaterThan(900);
    expect(c.stillMs).toBe(0);
    let back = t;
    for (let i = 1; i <= 10; i++) back = trackCursor(back, 1100 - i * 100, 500, 1000 + i * 100);
    expect(readCursor(back, 2000, SCREEN).vx).toBeLessThan(-900);
  });

  it('si deja de moverse, la velocidad cae a cero y cuenta el tiempo quieto', () => {
    let t = newCursorTrack(0);
    t = trackCursor(t, 100, 100, 0);
    t = trackCursor(t, 400, 100, 100);
    const c = readCursor(t, 5100, SCREEN);
    expect(c.speed).toBe(0);
    expect(c.stillMs).toBe(5000);
  });

  it('el temblor del ratón no cuenta como movimiento', () => {
    let t = newCursorTrack(0);
    t = trackCursor(t, 100, 100, 0);
    t = trackCursor(t, 100.5, 100.5, 1000);
    expect(readCursor(t, 1000, SCREEN).stillMs).toBe(1000);
  });

  it('fuera de la pantalla no está «en pantalla»', () => {
    const t = trackCursor(newCursorTrack(0), 2400, 300, 0);
    expect(readCursor(t, 0, SCREEN).onScreen).toBe(false);
  });
});

describe('personalidad en el escritorio', () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  }

  it('lee las dimensiones de la respuesta del servidor', () => {
    const mind = {
      dimensions: Object.fromEntries(Object.keys(neutralDims()).map((d, i) => [d, { value: 10 * (i + 1), keyword: 'x' }])),
    };
    expect(dimsFromMind(mind)).toEqual({ curiosity: 10, sociability: 20, bravery: 30, affection: 40, temper: 50 });
    expect(dimsFromMind({ dimensions: { curiosity: { value: 10 } } })).toBeNull();
    expect(dimsFromMind(null)).toBeNull();
  });

  it('sin servidor estima por especie, de forma determinista y distinta entre especies', () => {
    const a = fallbackDims({ species: { id: 'ignisaur' }, visualSeed: 42 });
    expect(a).toEqual(fallbackDims({ species: { id: 'ignisaur' }, visualSeed: 42 }));
    expect(a).not.toEqual(fallbackDims({ species: { id: 'axolunar' }, visualSeed: 42 }));
    expect(fallbackDims(null)).toEqual(neutralDims());
    for (const v of Object.values(fallbackDims({ species: { id: 'no-existe' }, visualSeed: 7 }))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('guarda y recupera por mascota, e ignora valores corruptos', () => {
    const storage = memoryStorage();
    const dims = { ...neutralDims(), temper: 88 };
    saveDims(storage, 'a', dims);
    expect(loadDims(storage, 'a')).toEqual(dims);
    expect(loadDims(storage, 'b')).toBeNull();
    storage.setItem('petai:dims:c', '{"curiosity":"mucha"}');
    expect(loadDims(storage, 'c')).toBeNull();
    expect(loadDims(null, 'a')).toBeNull();
  });
});

describe('locomoción', () => {
  it('avanza a velocidad constante y llega sin pasarse', () => {
    const loco = { targetX: 100, targetY: null, speed: 50 };
    const a = stepLocomotion(0, 500, loco, 1000);
    expect(a).toMatchObject({ x: 50, y: 500, dir: 1, arrived: false });
    const b = stepLocomotion(a.x, a.y, loco, 5000);
    expect(b).toMatchObject({ x: 100, y: 500, arrived: true });
    expect(stepLocomotion(100, 500, loco, 16).arrived).toBe(true);
  });

  it('se mueve en vertical o en diagonal y da el sentido horizontal', () => {
    expect(stepLocomotion(5, 800, { targetX: null, targetY: 30, speed: 70 }, 1000)).toMatchObject({ x: 5, y: 730, dir: 0 });
    const d = stepLocomotion(100, 100, { targetX: 70, targetY: 60, speed: 25 }, 1000);
    expect(d.x).toBeCloseTo(85);
    expect(d.y).toBeCloseTo(80);
    expect(d.dir).toBe(-1);
  });
});
