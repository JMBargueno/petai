import { describe, expect, it } from 'vitest';
import { clampBox, defaultBox, HABITAT_MIN, parseState, placeBox, scaleBox } from './habitatMode';

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

describe('scaleBox', () => {
  it('crece y encoge desde el centro manteniendo la proporción', () => {
    const b = { x: 600, y: 300, w: 600, h: 400 };
    expect(scaleBox(b, 1.5, screen)).toEqual({ x: 450, y: 200, w: 900, h: 600 });
    expect(scaleBox(b, 0.75, screen)).toEqual({ x: 675, y: 350, w: 450, h: 300 });
  });

  it('se detiene en el mínimo y en la pantalla sin deformarse', () => {
    const b = { x: 600, y: 300, w: 600, h: 400 };
    const tiny = scaleBox(b, 0.1, screen);
    expect(tiny.h).toBe(HABITAT_MIN.h);
    expect(tiny.w).toBe(390);
    const huge = scaleBox(b, 10, screen);
    expect(huge).toEqual({ x: 90, y: 0, w: 1620, h: 1080 });
  });

  it('si crece pegada a un borde, se recoloca dentro de la pantalla', () => {
    const b = scaleBox({ x: 1300, y: 660, w: 600, h: 400 }, 1.2, screen);
    expect(b.x + b.w).toBeLessThanOrEqual(screen.w);
    expect(b.y + b.h).toBeLessThanOrEqual(screen.h);
    expect(b.w).toBe(720);
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
