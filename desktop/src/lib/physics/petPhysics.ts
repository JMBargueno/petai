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
  gravity: number;            // px/s^2 (ej: 1800)
  restitution: number;        // elasticidad rebote (0 = plástico, 1 = elástico)
  groundFriction: number;     // frenado horizontal al rozar el suelo
  airResistance: number;      // frenado horizontal en el aire
  minBounceSpeed: number;     // velocidad mínima vertical para seguir rebotando
  maxThrowSpeed: number;      // velocidad máxima permitida
  impactFriction: number;     // pérdida horizontal en cada rebote contra el suelo
  minWallBounceSpeed: number; // por debajo, un roce con la pared no cuenta como rebote
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 1900,
  restitution: 0.42,
  groundFriction: 0.82,
  airResistance: 0.992,
  minBounceSpeed: 55,
  maxThrowSpeed: 2400,
  impactFriction: 0.88,
  minWallBounceSpeed: 60,
};

/** Paso fijo de integración: la simulación es idéntica a 30, 60 o 144 fps. */
export const FIXED_STEP = 1 / 120;
/** Tiempo máximo simulado por frame (evita la "espiral de la muerte" tras perder el foco). */
export const MAX_FRAME_TIME = 0.1;

export interface ThrowOptions {
  /** Momento en que se suelta (ms). Por defecto, el de la última muestra. */
  releaseTime?: number;
  /** Velocidad máxima del lanzamiento (px/s). */
  maxSpeed?: number;
  /** Ventana de muestras que cuentan para el gesto (ms). */
  windowMs?: number;
  /** Si el puntero llevaba este tiempo quieto al soltar, no hay lanzamiento (ms). */
  maxIdleMs?: number;
}

/**
 * Calcula la velocidad de lanzamiento a partir de las últimas muestras del puntero.
 * Usa una regresión lineal (mínimos cuadrados) de posición frente a tiempo sobre la
 * ventana reciente, más estable ante el jitter del ratón que tomar solo primera y última.
 */
export function calculateThrowVelocity(
  samples: PointerSample[],
  options: ThrowOptions = {}
): { vx: number; vy: number } {
  if (samples.length < 2) {
    return { vx: 0, vy: 0 };
  }

  const last = samples[samples.length - 1];
  const releaseTime = options.releaseTime ?? last.time;
  const windowMs = options.windowMs ?? 120;
  const maxIdleMs = options.maxIdleMs ?? 60;
  const maxSpeed = options.maxSpeed ?? DEFAULT_PHYSICS_CONFIG.maxThrowSpeed;

  // Se paró antes de soltar: se suelta sin impulso
  if (releaseTime - last.time > maxIdleMs) {
    return { vx: 0, vy: 0 };
  }

  const recent = samples.filter((s) => releaseTime - s.time <= windowMs);
  if (recent.length < 2) {
    return { vx: 0, vy: 0 };
  }

  const n = recent.length;
  let meanT = 0;
  let meanX = 0;
  let meanY = 0;
  for (const s of recent) {
    meanT += s.time;
    meanX += s.x;
    meanY += s.y;
  }
  meanT /= n;
  meanX /= n;
  meanY /= n;

  let varT = 0;
  let covX = 0;
  let covY = 0;
  for (const s of recent) {
    const dt = s.time - meanT;
    varT += dt * dt;
    covX += dt * (s.x - meanX);
    covY += dt * (s.y - meanY);
  }
  if (varT < 1e-6) {
    return { vx: 0, vy: 0 };
  }

  // Pendiente en px/ms → px/s
  let vx = (covX / varT) * 1000;
  let vy = (covY / varT) * 1000;

  // Limitar velocidad máxima por seguridad
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    const factor = maxSpeed / speed;
    vx *= factor;
    vy *= factor;
  }

  return { vx, vy };
}

interface StepResult {
  state: PhysicsState;
  /** Velocidad del impacto más fuerte que contó como rebote en este paso (0 si ninguno). */
  impactSpeed: number;
}

function integrate(
  state: PhysicsState,
  dt: number,
  bounds: PhysicsBounds,
  config: PhysicsConfig
): StepResult {
  let { x, y, vx, vy, isAirborne, bounceCount } = state;
  let impactSpeed = 0;

  // 1. Gravedad y resistencia del aire (Euler semi-implícito: primero velocidad, luego posición)
  vy += config.gravity * dt;
  vx *= Math.pow(config.airResistance, dt * 60);

  // 2. Integrar posiciones
  x += vx * dt;
  y += vy * dt;

  // 3. Rebote en paredes laterales
  if (x < bounds.minX || x > bounds.maxX) {
    x = x < bounds.minX ? bounds.minX : bounds.maxX;
    const hit = Math.abs(vx);
    vx = -vx * config.restitution;
    if (hit >= config.minWallBounceSpeed) {
      bounceCount++;
      impactSpeed = Math.max(impactSpeed, hit);
    }
  }

  // 4. Techo de la pantalla
  if (y < bounds.minY) {
    y = bounds.minY;
    const hit = Math.abs(vy);
    vy = -vy * config.restitution;
    if (hit >= config.minWallBounceSpeed) {
      bounceCount++;
      impactSpeed = Math.max(impactSpeed, hit);
    }
  }

  // 5. Suelo (barra de tareas o límite inferior)
  if (y >= bounds.maxY) {
    y = bounds.maxY;

    // El umbral incluye la gravedad de un paso: si no, apoyado en el suelo la propia
    // gravedad del paso provocaría micro-rebotes infinitos.
    if (Math.abs(vy) < config.minBounceSpeed + config.gravity * dt) {
      vy = 0;
      vx *= Math.pow(config.groundFriction, dt * 60);

      // Si la velocidad horizontal es residual, detener del todo la física
      if (Math.abs(vx) < 15) {
        vx = 0;
        isAirborne = false;
      }
    } else {
      impactSpeed = Math.max(impactSpeed, Math.abs(vy));
      vy = -vy * config.restitution;
      vx *= config.impactFriction;
      bounceCount++;
    }
  }

  return { state: { x, y, vx, vy, isAirborne, bounceCount }, impactSpeed };
}

/**
 * Ejecuta un paso de simulación física con resolución de bordes.
 * Para el bucle de render usa `advancePhysics`, que integra a paso fijo.
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
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));
  return integrate(state, clampedDt, bounds, config).state;
}

export interface AdvanceResult {
  state: PhysicsState;
  /** Tiempo sobrante (s) que pasar en la siguiente llamada. */
  accumulator: number;
  /** Impacto más fuerte del frame (px/s), para dosificar el squash. 0 si no hubo rebote. */
  impactSpeed: number;
}

/**
 * Avanza la simulación el tiempo real de un frame en pasos fijos de `FIXED_STEP`,
 * para que el resultado no dependa de los FPS.
 */
export function advancePhysics(
  state: PhysicsState,
  frameDt: number,
  bounds: PhysicsBounds,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
  accumulator = 0
): AdvanceResult {
  let acc = accumulator + Math.min(MAX_FRAME_TIME, Math.max(0, frameDt));
  let current = state;
  let impactSpeed = 0;

  while (acc >= FIXED_STEP && current.isAirborne) {
    const r = integrate(current, FIXED_STEP, bounds, config);
    current = r.state;
    impactSpeed = Math.max(impactSpeed, r.impactSpeed);
    acc -= FIXED_STEP;
  }
  if (!current.isAirborne) acc = 0;

  return { state: current, accumulator: acc, impactSpeed };
}
