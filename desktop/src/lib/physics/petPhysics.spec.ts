import { describe, it, expect } from 'vitest';
import {
  calculateThrowVelocity,
  stepPhysics,
  advancePhysics,
  DEFAULT_PHYSICS_CONFIG,
  type PhysicsState,
  type PhysicsBounds,
  type PointerSample,
} from './petPhysics';

describe('petPhysics', () => {
  const bounds: PhysicsBounds = {
    minX: 0,
    maxX: 800,
    minY: 0,
    maxY: 600,
  };

  it('calcula la velocidad de lanzamiento a partir de muestras temporales', () => {
    const samples: PointerSample[] = [
      { x: 100, y: 100, time: 1000 },
      { x: 120, y: 110, time: 1050 },
      { x: 150, y: 130, time: 1100 },
    ];

    const v = calculateThrowVelocity(samples);
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vy).toBeGreaterThan(0);
  });

  it('aplica gravedad a un estado en el aire', () => {
    const initial: PhysicsState = {
      x: 200,
      y: 200,
      vx: 0,
      vy: 0,
      isAirborne: true,
      bounceCount: 0,
    };

    const next = stepPhysics(initial, 0.05, bounds);
    expect(next.vy).toBeGreaterThan(0);
    expect(next.y).toBeGreaterThan(initial.y);
    expect(next.isAirborne).toBe(true);
  });

  it('rebota al alcanzar el suelo cuando la velocidad vertical es alta', () => {
    const falling: PhysicsState = {
      x: 200,
      y: 590,
      vx: 50,
      vy: 500, // cayendo rápido hacia maxY = 600
      isAirborne: true,
      bounceCount: 0,
    };

    const next = stepPhysics(falling, 0.05, bounds);
    expect(next.y).toBe(bounds.maxY);
    expect(next.vy).toBeLessThan(0); // rebota hacia arriba (velocidad negativa)
    expect(next.bounceCount).toBe(1);
    expect(next.isAirborne).toBe(true);
  });

  it('se posa y se detiene cuando la velocidad cae por debajo del umbral mínimo', () => {
    let state: PhysicsState = {
      x: 200,
      y: 599,
      vx: 5,
      vy: 10, // velocidad vertical muy baja
      isAirborne: true,
      bounceCount: 2,
    };

    // Varios pasos para amortiguar
    for (let i = 0; i < 10; i++) {
      state = stepPhysics(state, 0.05, bounds);
    }

    expect(state.y).toBe(bounds.maxY);
    expect(state.isAirborne).toBe(false);
    expect(state.vx).toBe(0);
    expect(state.vy).toBe(0);
  });

  it('rebota en las paredes laterales', () => {
    const hittingRight: PhysicsState = {
      x: 795,
      y: 300,
      vx: 300,
      vy: 0,
      isAirborne: true,
      bounceCount: 0,
    };

    const next = stepPhysics(hittingRight, 0.05, bounds);
    expect(next.x).toBe(bounds.maxX);
    expect(next.vx).toBeLessThan(0); // rebote hacia la izquierda
    expect(next.bounceCount).toBe(1);
  });

  describe('lanzamiento', () => {
    const flick: PointerSample[] = [
      { x: 100, y: 300, time: 1000 },
      { x: 130, y: 290, time: 1016 },
      { x: 160, y: 280, time: 1032 },
      { x: 190, y: 270, time: 1048 },
    ];

    it('no lanza si el puntero se detuvo antes de soltar', () => {
      const v = calculateThrowVelocity(flick, { releaseTime: 1048 + 200 });
      expect(v).toEqual({ vx: 0, vy: 0 });
    });

    it('lanza en la dirección del gesto al soltar en movimiento', () => {
      const v = calculateThrowVelocity(flick, { releaseTime: 1056 });
      // 30 px cada 16 ms ≈ 1875 px/s a la derecha y algo hacia arriba
      expect(v.vx).toBeCloseTo(1875, 0);
      expect(v.vy).toBeCloseTo(-625, 0);
    });

    it('ignora muestras antiguas fuera de la ventana', () => {
      const samples: PointerSample[] = [
        { x: 0, y: 0, time: 0 }, // movimiento viejo muy rápido a la izquierda
        { x: -900, y: 0, time: 50 },
        ...flick.map((s) => ({ ...s, time: s.time + 1000 })),
      ];
      const v = calculateThrowVelocity(samples, { releaseTime: 2050 });
      expect(v.vx).toBeGreaterThan(0);
    });

    it('limita la velocidad al máximo indicado', () => {
      const v = calculateThrowVelocity(flick, { releaseTime: 1048, maxSpeed: 500 });
      expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(500, 3);
    });
  });

  describe('advancePhysics (paso fijo)', () => {
    const screen: PhysicsBounds = { minX: 0, maxX: 1600, minY: 0, maxY: 800 };

    function simulate(fps: number) {
      let state: PhysicsState = { x: 100, y: 400, vx: 900, vy: -900, isAirborne: true, bounceCount: 0 };
      let acc = 0;
      let t = 0;
      const dt = 1 / fps;
      while (state.isAirborne && t < 10) {
        const r = advancePhysics(state, dt, screen, DEFAULT_PHYSICS_CONFIG, acc);
        state = r.state;
        acc = r.accumulator;
        t += dt;
      }
      return { state, t };
    }

    it('el mismo lanzamiento aterriza igual a 30 y a 144 fps', () => {
      const slow = simulate(30);
      const fast = simulate(144);
      expect(slow.state.isAirborne).toBe(false);
      expect(fast.state.isAirborne).toBe(false);
      expect(Math.abs(slow.state.x - fast.state.x)).toBeLessThan(15);
      expect(Math.abs(slow.t - fast.t)).toBeLessThan(0.1);
      expect(slow.state.bounceCount).toBe(fast.state.bounceCount);
    });

    it('apoyado y deslizando a 30 fps no genera micro-rebotes', () => {
      let state: PhysicsState = { x: 100, y: 800, vx: 400, vy: 0, isAirborne: true, bounceCount: 0 };
      let acc = 0;
      for (let i = 0; i < 120 && state.isAirborne; i++) {
        const r = advancePhysics(state, 1 / 30, screen, DEFAULT_PHYSICS_CONFIG, acc);
        state = r.state;
        acc = r.accumulator;
        expect(r.impactSpeed).toBe(0);
      }
      expect(state.bounceCount).toBe(0);
      expect(state.isAirborne).toBe(false);
    });

    it('no simula más de MAX_FRAME_TIME tras una pausa larga', () => {
      const state: PhysicsState = { x: 100, y: 100, vx: 0, vy: 0, isAirborne: true, bounceCount: 0 };
      const r = advancePhysics(state, 5, screen);
      // En 0.1 s cae como mucho ½·g·t² ≈ 9.5 px
      expect(r.state.y - state.y).toBeLessThan(12);
    });

    it('informa de la fuerza del impacto contra el suelo', () => {
      const state: PhysicsState = { x: 100, y: 790, vx: 0, vy: 1200, isAirborne: true, bounceCount: 0 };
      const r = advancePhysics(state, 1 / 60, screen);
      expect(r.impactSpeed).toBeGreaterThan(1100);
      expect(r.state.vy).toBeLessThan(0);
    });
  });
});
