import { describe, it, expect } from 'vitest';
import {
  stepBallPhysics,
  kickBall,
  checkPetBallCollision,
  throwBall,
  advanceBallPhysics,
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

  it('throwBall fija la velocidad y kickBall la suma', () => {
    const moving: BallState = { ...initialBall, vx: 100, vy: 900 };
    const thrown = throwBall(moving, 300, -200);
    expect(thrown.vx).toBe(300);
    expect(thrown.vy).toBe(-200);
    expect(thrown.isRolling).toBe(true);

    const kicked = kickBall(moving, 300, -200);
    expect(kicked.vx).toBe(400);
    expect(kicked.vy).toBe(700);
  });

  it('throwBall limita la velocidad máxima', () => {
    const thrown = throwBall(initialBall, 10_000, 0, 1800);
    expect(thrown.vx).toBeCloseTo(1800, 6);
  });

  it('varios frames de solape con la mascota no acumulan impulso', () => {
    const petBox = { x: 450, y: 500, width: 128, height: 128 };
    let b: BallState = { ...initialBall, x: 540, y: 520, vx: -50, vy: 200 };
    const first = checkPetBallCollision(petBox, b);
    expect(first.collides).toBe(true);
    b = throwBall(b, first.kickX, first.kickY);
    const speedAfterFirst = Math.hypot(b.vx, b.vy);

    // Siguientes frames: la pelota sigue solapada pero ya se aleja → sin nuevo golpe
    for (let i = 0; i < 5; i++) {
      const col = checkPetBallCollision(petBox, b);
      expect(col.collides).toBe(false);
    }
    expect(Math.hypot(b.vx, b.vy)).toBe(speedAfterFirst);
  });

  describe('advanceBallPhysics (paso fijo)', () => {
    const screen: Bounds = { width: 1600, height: 800 };

    function simulate(fps: number) {
      let b: BallState = { ...initialBall, x: 100, y: 300, vx: 700, vy: -600, isRolling: true };
      let acc = 0;
      const dt = 1 / fps;
      for (let t = 0; t < 1.5; t += dt) {
        const r = advanceBallPhysics(b, screen, dt, {}, acc);
        b = r.ball;
        acc = r.accumulator;
      }
      return b;
    }

    it('la trayectoria es la misma a 30 y a 144 fps', () => {
      const slow = simulate(30);
      const fast = simulate(144);
      expect(Math.abs(slow.x - fast.x)).toBeLessThan(15);
      expect(Math.abs(slow.y - fast.y)).toBeLessThan(15);
    });

    it('en reposo sobre el suelo no tiembla ni cuenta rebotes', () => {
      let b: BallState = { ...initialBall, x: 100, y: screen.height - 32, isRolling: true };
      let acc = 0;
      for (let i = 0; i < 60; i++) {
        const r = advanceBallPhysics(b, screen, 1 / 30, {}, acc);
        b = r.ball;
        acc = r.accumulator;
      }
      expect(b.bounces).toBe(0);
      expect(b.isRolling).toBe(false);
      expect(b.y).toBe(screen.height - 32);
    });
  });
});
