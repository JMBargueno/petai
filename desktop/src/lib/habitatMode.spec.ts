import { describe, expect, it } from 'vitest';
import { clampBox, defaultBox, HABITAT_MIN, parseState, placeBox } from './habitatMode';

const screen = { w: 1920, h: 1080 };

describe('clampBox', () => {
  it('respeta el tamaño mínimo', () => {
    const b = clampBox({ x: 10, y: 10, w: 50, h: 20 }, screen);
    expect(b.w).toBe(HABITAT_MIN.w);
    expect(b.h).toBe(HABITAT_MIN.h);
  });

  it('no deja que se salga de la pantalla ni que sea mayor que ella', () => {
    expect(clampBox({ x: 1800, y: -40, w: 600, h: 400 }, screen)).toEqual({ x: 1320, y: 0, w: 600, h: 400 });
    expect(clampBox({ x: 0, y: 0, w: 5000, h: 5000 }, screen)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
});

describe('placeBox', () => {
  it('sin caja guardada usa la de por defecto, abajo a la derecha', () => {
    const b = placeBox(null, screen);
    expect(b).toEqual(defaultBox(screen));
    expect(b.x + b.w).toBeLessThan(screen.w);
    expect(b.x).toBeGreaterThan(screen.w / 2);
  });

  it('encaja la guardada en una pantalla más pequeña sin perder el original', () => {
    const saved = { x: 1500, y: 900, w: 640, h: 460 };
    expect(placeBox(saved, { w: 1280, h: 720 })).toEqual({ x: 640, y: 260, w: 640, h: 460 });
    expect(placeBox(saved, screen)).toEqual({ x: 1280, y: 620, w: 640, h: 460 });
  });
});

describe('parseState', () => {
  it('sin nada guardado: apagado y sin caja', () => {
    expect(parseState(null)).toEqual({ on: false, roomId: '', box: null });
  });

  it('recupera lo guardado', () => {
    const raw = JSON.stringify({ on: true, roomId: 'garden', box: { x: 10, y: 20, w: 640, h: 460 } });
    expect(parseState(raw)).toEqual({ on: true, roomId: 'garden', box: { x: 10, y: 20, w: 640, h: 460 } });
  });

  it('ignora datos corruptos', () => {
    expect(parseState('{nope').on).toBe(false);
    expect(parseState(JSON.stringify({ on: 'yes', box: { x: 'a' } }))).toEqual({ on: false, roomId: '', box: null });
  });
});
