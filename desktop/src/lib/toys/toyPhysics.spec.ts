import { describe, it, expect } from 'vitest';
import {
  stepBallPhysics,
  kickBall,
  checkPetBallCollision,
  type BallState,
  type Bounds,
} from './toyPhysics';

describe('toyPhysics', () => {
  const bounds: Bounds = { width: 1000, height: 600 };

  const initialBall: BallState = {
    x: 500,
    y: 100,
    vx: 0,
    vy: 0,
    radius: 16,
    isRolling: false,
    bounces: 0,
  };

  it('debe aplicar gravedad y hacer caer la pelota hacia el suelo', () => {
    const next = stepBallPhysics(initialBall, bounds, 0.1);
    expect(next.vy).toBeGreaterThan(0);
    expect(next.y).toBeGreaterThan(initialBall.y);
  });

  it('debe rebotar al tocar el suelo con velocidad reducida por el coeficiente de restitución', () => {
    const nearFloorBall: BallState = {
      x: 500,
      y: bounds.height - initialBall.radius * 2 - 2,
      vx: 0,
      vy: 400,
      radius: 16,
      isRolling: true,
      bounces: 0,
    };

    const next = stepBallPhysics(nearFloorBall, bounds, 0.05);
    expect(next.y).toBeLessThanOrEqual(bounds.height - initialBall.radius * 2);
    expect(next.vy).toBeLessThan(0); // Velocidad invertida hacia arriba
    expect(next.bounces).toBe(1);
  });

  it('debe responder a un impulso con kickBall', () => {
    const kicked = kickBall(initialBall, 250, -300);
    expect(kicked.vx).toBe(250);
    expect(kicked.vy).toBe(-300);
    expect(kicked.isRolling).toBe(true);
  });

  it('debe detectar colisión con la mascota y calcular impulso de despeje', () => {
    const petBox = { x: 450, y: 500, width: 128, height: 128 };
    const collidingBall: BallState = {
      x: 480,
      y: 520,
      vx: 0,
      vy: 0,
      radius: 16,
      isRolling: false,
      bounces: 0,
    };

    const res = checkPetBallCollision(petBox, collidingBall);
    expect(res.collides).toBe(true);
    expect(res.kickY).toBeLessThan(0); // Impulso hacia arriba
  });

  it('no debe detectar colisión si la pelota está lejos de la mascota', () => {
    const petBox = { x: 100, y: 500, width: 128, height: 128 };
    const farBall: BallState = {
      x: 800,
      y: 500,
      vx: 0,
      vy: 0,
      radius: 16,
      isRolling: false,
      bounces: 0,
    };

    const res = checkPetBallCollision(petBox, farBall);
    expect(res.collides).toBe(false);
  });
});
