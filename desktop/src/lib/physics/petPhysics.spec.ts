import { describe, it, expect } from 'vitest';
import {
  calculateThrowVelocity,
  stepPhysics,
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
});
