/**
 * Motor de físicas para juguetes en el escritorio (p. ej. Pelotita de goma).
 * Simula gravedad, rebote elástico, fricción y respuesta al choque con la mascota o el cursor.
 */

import { FIXED_STEP, MAX_FRAME_TIME } from '../physics/petPhysics';

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isRolling: boolean;
  bounces: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export interface BallPhysicsConfig {
  gravity?: number;         // px/s^2 (por defecto 980)
  bounce?: number;          // Coeficiente de restitución vertical (0..1, ej. 0.72)
  groundFriction?: number;  // Fricción horizontal sobre el suelo (ej. 0.92)
  airResistance?: number;   // Fricción con el aire (ej. 0.998)
  minVelocity?: number;     // Límite para detener movimiento (ej. 5)
  maxSpeed?: number;        // Velocidad máxima de la pelota (px/s)
}

const DEFAULT_CONFIG: Required<BallPhysicsConfig> = {
  gravity: 980,
  bounce: 0.72,
  groundFriction: 0.92,
  airResistance: 0.998,
  minVelocity: 8,
  maxSpeed: 2200,
};

/** Velocidad máxima al lanzar la pelota con el ratón (px/s). */
export const BALL_MAX_THROW_SPEED = 1800;

function clampSpeed(vx: number, vy: number, max: number): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed <= max || speed === 0) return { vx, vy };
  const f = max / speed;
  return { vx: vx * f, vy: vy * f };
}

interface BallStepResult {
  ball: BallState;
  impactSpeed: number;
}

function integrateBall(
  ball: BallState,
  bounds: Bounds,
  dt: number,
  cfg: Required<BallPhysicsConfig>
): BallStepResult {
  let { x, y, vx, vy, radius, bounces } = ball;
  let impactSpeed = 0;

  // Aplicar gravedad
  vy += cfg.gravity * dt;

  // Resistencia del aire
  const drag = Math.pow(cfg.airResistance, dt * 60);
  vx *= drag;
  vy *= drag;

  ({ vx, vy } = clampSpeed(vx, vy, cfg.maxSpeed));

  // Mover
  x += vx * dt;
  y += vy * dt;

  const minX = 0;
  const maxX = Math.max(0, bounds.width - radius * 2);
  const minY = 0;
  const maxY = Math.max(0, bounds.height - radius * 2);

  // Rebote en paredes laterales
  if (x < minX || x > maxX) {
    x = x < minX ? minX : maxX;
    vx = -vx * cfg.bounce;
  }

  // Rebote en el techo
  if (y < minY) {
    y = minY;
    vy = -vy * cfg.bounce;
  }
  // Rebote en el suelo
  else if (y >= maxY) {
    y = maxY;
    // El umbral incluye la gravedad de un paso para que, apoyada, no tiemble
    if (Math.abs(vy) > cfg.minVelocity * 4 + cfg.gravity * dt) {
      impactSpeed = Math.abs(vy);
      vy = -vy * cfg.bounce;
      bounces += 1;
    } else {
      vy = 0; // Se apoya en el suelo
    }
    // Fricción del suelo
    vx *= Math.pow(cfg.groundFriction, dt * 60);
  }

  // Umbral de reposo
  if (Math.abs(vx) < cfg.minVelocity && Math.abs(vy) < cfg.minVelocity && y >= maxY - 2) {
    vx = 0;
    vy = 0;
    y = maxY;
  }

  const isRolling = Math.abs(vx) > 0 || Math.abs(vy) > 0;

  return { ball: { x, y, vx, vy, radius, isRolling, bounces }, impactSpeed };
}

/**
 * Avanza la simulación física de la pelota en dt segundos (un solo paso).
 * Para el bucle de render usa `advanceBallPhysics`, que integra a paso fijo.
 */
export function stepBallPhysics(
  ball: BallState,
  bounds: Bounds,
  dt: number,
  config: BallPhysicsConfig = {}
): BallState {
  return integrateBall(ball, bounds, dt, { ...DEFAULT_CONFIG, ...config }).ball;
}

export interface BallAdvanceResult {
  ball: BallState;
  accumulator: number;
  impactSpeed: number;
}

/**
 * Avanza la pelota el tiempo real de un frame en pasos fijos, independiente de los FPS.
 * Si está en reposo no se simula nada.
 */
export function advanceBallPhysics(
  ball: BallState,
  bounds: Bounds,
  frameDt: number,
  config: BallPhysicsConfig = {},
  accumulator = 0
): BallAdvanceResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let acc = accumulator + Math.min(MAX_FRAME_TIME, Math.max(0, frameDt));
  let current = ball;
  let impactSpeed = 0;

  while (acc >= FIXED_STEP && current.isRolling) {
    const r = integrateBall(current, bounds, FIXED_STEP, cfg);
    current = r.ball;
    impactSpeed = Math.max(impactSpeed, r.impactSpeed);
    acc -= FIXED_STEP;
  }
  if (!current.isRolling) acc = 0;

  return { ball: current, accumulator: acc, impactSpeed };
}

/**
 * Da un impulso directo a la pelota (ej. click del ratón): se suma a su velocidad.
 */
export function kickBall(ball: BallState, impulseX: number, impulseY: number): BallState {
  return {
    ...ball,
    vx: ball.vx + impulseX,
    vy: ball.vy + impulseY,
    bounces: 0,
    isRolling: true,
  };
}

/**
 * Lanza la pelota con una velocidad concreta (sustituye la que tuviera).
 * Se usa al soltarla tras arrastrarla y cuando la mascota la golpea.
 */
export function throwBall(
  ball: BallState,
  vx: number,
  vy: number,
  maxSpeed = DEFAULT_CONFIG.maxSpeed
): BallState {
  const v = clampSpeed(vx, vy, maxSpeed);
  return {
    ...ball,
    vx: v.vx,
    vy: v.vy,
    bounces: 0,
    isRolling: true,
  };
}

/**
 * Comprueba si la mascota y la pelota están colisionando.
 * Si colisionan, `kickX`/`kickY` son la **nueva velocidad** de la pelota (aplicar con `throwBall`):
 * se conserva la componente tangencial y la normal se fija hacia fuera de la mascota.
 * Si la pelota ya se está alejando, no hay colisión (evita acumular impulsos frame a frame).
 */
export function checkPetBallCollision(
  petBox: { x: number; y: number; width: number; height: number },
  ball: BallState
): { collides: boolean; kickX: number; kickY: number } {
  const ballCenterX = ball.x + ball.radius;
  const ballCenterY = ball.y + ball.radius;

  // Centro de la mascota
  const petCenterX = petBox.x + petBox.width / 2;
  const petCenterY = petBox.y + petBox.height / 2;

  // Verificación aproximada por distancia circular
  const distX = ballCenterX - petCenterX;
  const distY = ballCenterY - petCenterY;
  const distance = Math.hypot(distX, distY);
  const minDistance = petBox.width * 0.45 + ball.radius;

  if (distance >= minDistance) {
    return { collides: false, kickX: 0, kickY: 0 };
  }

  // Normal hacia fuera de la mascota (si coinciden los centros, hacia arriba)
  const nx = distance > 1e-6 ? distX / distance : 0;
  const ny = distance > 1e-6 ? distY / distance : -1;

  // Ya se aleja: el golpe anterior ya se aplicó
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn > 0) {
    return { collides: false, kickX: 0, kickY: 0 };
  }

  // Componente tangencial conservada + normal fijada hacia fuera
  const tx = ball.vx - vn * nx;
  const ty = ball.vy - vn * ny;
  const speed = 450 + Math.random() * 150;
  let kickX = tx * 0.6 + nx * speed;
  let kickY = ty * 0.6 + ny * speed;
  kickY = Math.min(-180, kickY); // siempre un poco hacia arriba

  ({ vx: kickX, vy: kickY } = clampSpeed(kickX, kickY, DEFAULT_CONFIG.maxSpeed));

  return { collides: true, kickX, kickY };
}
