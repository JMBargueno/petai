import { Canvas2, hash, type FxPalette, type PixelSink } from '@pockai/scene/effects';

/**
 * Reloj del Éter (el del pomodoro) en pixel art: despertador redondo con dos campanas, una clave en
 * rombo arriba (la del Nexo) y un anillo de progreso alrededor de la esfera. Se tiñe con el Flujo del
 * Pockai. Los dígitos van en DOM encima de la esfera (ver `PomodoroClock.svelte`).
 *
 * Rejilla 48×54, se pinta ×2.
 */
export const CLOCK_W = 48;
export const CLOCK_H = 54;
export const CLOCK_SCALE = 2;
const CX = 24;
const CY = 29;
const R_OUT = 20;
const R_RING = 17;
const R_FACE = 15;

export interface ClockLook {
  palette: FxPalette;
  /** 0..1 de la fase en curso. */
  progress: number;
  phase: 'work' | 'break' | 'idle';
  paused: boolean;
  seed: number;
}

export function drawClock(sink: PixelSink, look: ClockLook): void {
  const p = look.palette;
  const c = new Canvas2(CLOCK_W, CLOCK_H);
  const lit = look.paused ? p.mid : look.phase === 'break' ? p.glow : p.light;

  // Campanas
  for (const bx of [CX - 13, CX + 13]) {
    for (let y = -5; y <= 0; y++) {
      for (let x = -5; x <= 5; x++) {
        if (x * x + y * y * 1.6 <= 26) c.set(bx + x, CY - 16 + y, y <= -3 && x < 0 ? p.light : p.mid);
      }
    }
  }
  // Clave en rombo del Nexo, sobre un vástago
  for (let y = 0; y < 3; y++) c.set(CX, CY - 22 + y, p.deep);
  for (let y = -3; y <= 3; y++) {
    const half = 3 - Math.abs(y);
    for (let x = -half; x <= half; x++) c.set(CX + x, CY - 26 + y, Math.abs(x) + Math.abs(y) <= 1 ? p.glow : p.light);
  }
  // Patas
  for (const fx of [CX - 11, CX + 10]) {
    for (let y = 0; y < 3; y++) {
      c.set(fx, CY + 18 + y, p.deep);
      c.set(fx + 1, CY + 18 + y, p.deep);
    }
  }

  // Cuerpo: aro, anillo de progreso y esfera del vacío del Éter
  for (let y = -R_OUT; y <= R_OUT; y++) {
    for (let x = -R_OUT; x <= R_OUT; x++) {
      const d = Math.hypot(x, y);
      if (d > R_OUT + 0.3) continue;
      let color: string;
      if (d > R_RING + 0.8) {
        // Aro con brillo arriba a la izquierda
        color = x + y < -R_OUT * 0.9 ? p.light : p.mid;
      } else if (d > R_FACE + 0.5) {
        // Anillo: se enciende en sentido horario desde las 12
        const a = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
        color = a / (Math.PI * 2) <= look.progress ? lit : p.deep;
      } else {
        color = hash(x + 30, y + 30, look.seed) < 0.05 ? p.void1 : p.void0;
      }
      c.set(CX + x, CY + y, color);
    }
  }
  // Marcas de las horas (12, 3, 6, 9)
  for (const [mx, my] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) c.set(CX + mx * (R_FACE - 1), CY + my * (R_FACE - 1), p.deep);

  c.flush(sink, p.outline);
}

/** Centro de la esfera en px de pantalla relativo a la esquina del lienzo (para los dígitos). */
export const CLOCK_FACE = { x: CX * CLOCK_SCALE, y: CY * CLOCK_SCALE, r: R_FACE * CLOCK_SCALE };
