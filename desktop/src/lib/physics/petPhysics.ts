export interface PhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isAirborne: boolean;
  bounceCount: number;
}

export interface PhysicsBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PointerSample {
  x: number;
  y: number;
  time: number;
}

export interface PhysicsConfig {
  gravity: number;           // px/s^2 (ej: 1800)
  restitution: number;       // elasticidad rebote (0 = plástico, 1 = elástico)
  groundFriction: number;    // frenado horizontal al rozar el suelo
  airResistance: number;     // frenado horizontal en el aire
  minBounceSpeed: number;    // velocidad mínima vertical para seguir rebotando
  maxThrowSpeed: number;     // velocidad máxima permitida
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 1900,
  restitution: 0.42,
  groundFriction: 0.82,
  airResistance: 0.992,
  minBounceSpeed: 55,
  maxThrowSpeed: 2400,
};

/**
 * Calcula la velocidad de lanzamiento a partir de las últimas muestras del puntero.
 */
export function calculateThrowVelocity(
  samples: PointerSample[],
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG
): { vx: number; vy: number } {
  if (samples.length < 2) {
    return { vx: 0, vy: 0 };
  }

  // Tomamos hasta las últimas 5 muestras en una ventana de ~120ms
  const now = samples[samples.length - 1].time;
  const recent = samples.filter((s) => now - s.time <= 120);
  if (recent.length < 2) {
    return { vx: 0, vy: 0 };
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = Math.max(0.016, (last.time - first.time) / 1000);

  let rawVx = (last.x - first.x) / dt;
  let rawVy = (last.y - first.y) / dt;

  // Limitar velocidad máxima por seguridad
  const speed = Math.hypot(rawVx, rawVy);
  if (speed > config.maxThrowSpeed) {
    const factor = config.maxThrowSpeed / speed;
    rawVx *= factor;
    rawVy *= factor;
  }

  return { vx: rawVx, vy: rawVy };
}

/**
 * Ejecuta un paso de simulación física (Euler integration con resolución de bordes).
 */
export function stepPhysics(
  state: PhysicsState,
  dt: number,
  bounds: PhysicsBounds,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG
): PhysicsState {
  if (!state.isAirborne) {
    return state;
  }

  // Clampear dt razonable para evitar saltos enormes por pérdida de foco
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  let { x, y, vx, vy, isAirborne, bounceCount } = state;

  // 1. Aplicar gravedad y resistencia del aire
  vy += config.gravity * clampedDt;
  vx *= Math.pow(config.airResistance, clampedDt * 60);

  // 2. Integrar posiciones
  x += vx * clampedDt;
  y += vy * clampedDt;

  // 3. Rebote en paredes laterales
  if (x < bounds.minX) {
    x = bounds.minX;
    vx = -vx * config.restitution;
    bounceCount++;
  } else if (x > bounds.maxX) {
    x = bounds.maxX;
    vx = -vx * config.restitution;
    bounceCount++;
  }

  // 4. Techo de la pantalla
  if (y < bounds.minY) {
    y = bounds.minY;
    vy = -vy * config.restitution;
    bounceCount++;
  }

  // 5. Suelo (barra de tareas o límite inferior)
  if (y >= bounds.maxY) {
    y = bounds.maxY;

    if (Math.abs(vy) < config.minBounceSpeed) {
      // Dejar de rebotar verticalmente
      vy = 0;
      vx *= Math.pow(config.groundFriction, clampedDt * 60);

      // Si la velocidad horizontal es residual, detener del todo la física
      if (Math.abs(vx) < 15) {
        vx = 0;
        isAirborne = false;
      }
    } else {
      // Rebote hacia arriba
      vy = -vy * config.restitution;
      vx *= 0.88; // Fricción de impacto
      bounceCount++;
    }
  }

  return {
    x,
    y,
    vx,
    vy,
    isAirborne,
    bounceCount,
  };
}
