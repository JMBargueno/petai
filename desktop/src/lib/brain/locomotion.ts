/**
 * Locomoción del Pockai por el escritorio: avanza hacia un objetivo a velocidad constante,
 * frame a frame. Sustituye a los saltos de N píxeles cada 3 s. Función pura.
 */
export interface Locomotion {
  /** Destino en px; `null` en un eje = ese eje no se mueve. */
  targetX: number | null;
  targetY: number | null;
  /** Velocidad en px/s. */
  speed: number;
}

export interface LocoStep {
  x: number;
  y: number;
  /** Sentido horizontal del paso (0 si no se movió en horizontal). */
  dir: 1 | -1 | 0;
  arrived: boolean;
}

/** A menos de esta distancia se da por llegado (evita vibrar alrededor del destino). */
const ARRIVE_PX = 0.5;

export function stepLocomotion(x: number, y: number, loco: Locomotion, dtMs: number): LocoStep {
  const dx = loco.targetX === null ? 0 : loco.targetX - x;
  const dy = loco.targetY === null ? 0 : loco.targetY - y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVE_PX) {
    return { x: loco.targetX ?? x, y: loco.targetY ?? y, dir: 0, arrived: true };
  }
  const step = Math.max(0, loco.speed) * (Math.max(0, dtMs) / 1000);
  if (step >= dist) {
    return { x: x + dx, y: y + dy, dir: dx > 0 ? 1 : dx < 0 ? -1 : 0, arrived: true };
  }
  const k = step / dist;
  return { x: x + dx * k, y: y + dy * k, dir: dx > 0 ? 1 : dx < 0 ? -1 : 0, arrived: false };
}

/** Mantiene un destino horizontal dentro de la pantalla (con margen opcional fuera de ella). */
export function clampX(x: number, screenW: number, size: number, overhang = 0): number {
  return Math.min(Math.max(-overhang, x), Math.max(0, screenW - size) + overhang);
}
