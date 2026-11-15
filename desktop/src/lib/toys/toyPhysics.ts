/**
 * Motor de físicas para juguetes en el escritorio (p. ej. Pelotita de goma).
 * Simula gravedad, rebote elástico, fricción y respuesta al choque con la mascota o el cursor.
 */

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
}

const DEFAULT_CONFIG: Required<BallPhysicsConfig> = {
  gravity: 980,
  bounce: 0.72,
  groundFriction: 0.92,
  airResistance: 0.998,
  minVelocity: 8,
};

/**
 * Avanza la simulación física de la pelota en dt segundos.
 */
export function stepBallPhysics(
  ball: BallState,
  bounds: Bounds,
  dt: number,
  config: BallPhysicsConfig = {}
): BallState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let { x, y, vx, vy, radius, bounces } = ball;

  // Aplicar gravedad
  vy += cfg.gravity * dt;

  // Resistencia del aire
  vx *= Math.pow(cfg.airResistance, dt * 60);
  vy *= Math.pow(cfg.airResistance, dt * 60);

  // Mover
  x += vx * dt;
  y += vy * dt;

  const minX = 0;
  const maxX = Math.max(0, bounds.width - radius * 2);
  const minY = 0;
  const maxY = Math.max(0, bounds.height - radius * 2);

  // Rebote en pared izquierda
  if (x < minX) {
    x = minX;
    vx = -vx * cfg.bounce;
  }
  // Rebote en pared derecha
  else if (x > maxX) {
    x = maxX;
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
    if (Math.abs(vy) > cfg.minVelocity * 4) {
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

  return {
    x,
    y,
    vx,
    vy,
    radius,
    isRolling,
    bounces,
  };
}

/**
 * Da un impulso directo a la pelota (ej. golpe de la mascota o click del ratón).
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
 * Comprueba si la mascota y la pelota están colisionando.
 * Si colisionan, devuelve un vector de rebote para la pelota.
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

  if (distance < minDistance) {
    // La mascota patea la pelota hacia fuera con impulso
    const angle = Math.atan2(distY, distX);
    const speed = 450 + Math.random() * 150;
    return {
      collides: true,
      kickX: Math.cos(angle) * speed,
      kickY: Math.min(-180, Math.sin(angle) * speed), // siempre un poco hacia arriba
    };
  }

  return { collides: false, kickX: 0, kickY: 0 };
}
