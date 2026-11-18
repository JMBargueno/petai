import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';

/**
 * Capullo del Telar: la evolución (LORE §1 el Telar de Mulberry; §6 crecimiento y Apoteosis).
 *
 * Seis hebras del Flujo llegan en espiral y envuelven a la mascota; el capullo se teje de abajo
 * arriba hasta taparla. Mientras late (fase `hold`), la mascota se re-hornea con su nueva etapa
 * —antes era un corte en seco—; después el capullo se agrieta de luz, estalla en jirones y la
 * nueva forma queda a la vista entre motas que suben.
 *
 * Va DELANTE de la mascota. `params.stage === 'final'` (la Apoteosis) añade una corona de
 * destellos sobre el capullo.
 *
 * Rejilla 64×78 ×2: la misma anchura que el frame de la mascota; pies en la fila 74.
 */

const W = 64;
const H = 78;
const CX = 32;
const FEET = 74;
/** Capullo: elipse que cubre la etapa más alta (54 px nativos). */
const CY = 47;
const RX = 19;
const RY = 27;
const TOP = CY - RY;
const THREADS = 6;

/** ¿Cae el píxel nativo (x, y) dentro del capullo? (La web lo usa para encoger a la mascota dentro.) */
export function inCocoon(x: number, y: number): boolean {
  const dx = (x + 0.5 - CX) / RX;
  const dy = (y + 0.5 - CY) / RY;
  // Algo más ancho abajo: un capullo, no un huevo perfecto
  const widen = y > CY ? 1 + (y - CY) / (RY * 6) : 1;
  return dx * dx * (1 / (widen * widen)) + dy * dy <= 1 && y <= FEET;
}

/** Textura de seda enrollada: bandas diagonales que se cruzan, con luz arriba a la izquierda. */
function silk(f: FxFrame, x: number, y: number, pulse: number): string {
  const { palette } = f;
  const band = (((x - CX) * 0.55 + y) | 0) % 5;
  const cross = (((CX - x) * 0.55 + y + 2) | 0) % 7;
  const lightSide = x - CX + (y - CY) * 0.6 < -6;
  let c = band === 0 ? palette.light : band === 1 || band === 4 ? palette.mid : palette.deep;
  if (cross === 0) c = palette.mid;
  if (lightSide && band <= 1) c = palette.light;
  if (lightSide && band === 0 && cross === 0) c = palette.glow;
  // Latido: un anillo de luz recorre el capullo de abajo arriba
  if (pulse >= 0) {
    const ry = FEET - pulse * (FEET - TOP);
    if (Math.abs(y - ry) < 1.5 && band !== 2) c = palette.glow;
  }
  return c;
}

function paintCocoon(c: Canvas2, f: FxFrame, fill: number, pulse: number) {
  const cut = FEET - fill * (FEET - TOP + 1);
  for (let y = TOP - 1; y <= FEET; y++) {
    for (let x = CX - RX - 4; x <= CX + RX + 4; x++) {
      if (!inCocoon(x, y)) continue;
      if (y < cut) continue;
      c.set(x, y, silk(f, x, y, pulse));
    }
  }
  // Frente del tejido: la hebra que está dando la vuelta
  if (fill > 0 && fill < 1) {
    const yy = Math.round(cut);
    for (let x = CX - RX - 2; x <= CX + RX + 2; x++) {
      if (inCocoon(x, yy) || inCocoon(x, yy + 1)) c.set(x, yy - 1, hash(x, yy, f.seed) < 0.5 ? f.palette.glow : f.palette.light);
    }
  }
}

/** Hebras que llegan en espiral hacia el capullo: cada una es una estela continua de ~14 px. */
function paintThreads(c: Canvas2, f: FxFrame, t: number) {
  const { palette } = f;
  const pos = (a0: number, tt: number) => {
    const e = easeOut(Math.max(0, tt));
    const r = 44 * (1 - e) + RX * 0.95 * e;
    const a = a0 + e * Math.PI * 1.6;
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r * 1.3] as const;
  };
  for (let k = 0; k < THREADS; k++) {
    const a0 = (k / THREADS) * Math.PI * 2 + hash(k, 1, f.seed) * 0.5;
    const steps = 18;
    for (let i = steps; i >= 0; i--) {
      const tt = t - i * 0.012;
      if (tt < 0) continue;
      const [x, y] = pos(a0, tt);
      const col = i === 0 ? palette.glow : i < 4 ? palette.light : i < 11 ? palette.mid : palette.deep;
      c.set(x, y, col);
    }
  }
}

function paintCrown(c: Canvas2, f: FxFrame, lit: boolean) {
  if (f.params.stage !== 'final') return;
  for (let k = 0; k < 5; k++) {
    const x = CX - 10 + k * 5;
    const y = TOP - 4 - (k === 2 ? 3 : k % 2 === 0 ? 0 : 1);
    c.set(x, y, lit ? f.palette.glow : f.palette.light);
    if (k === 2 || lit) {
      c.set(x, y - 1, f.palette.light);
      c.set(x - 1, y, f.palette.mid);
      c.set(x + 1, y, f.palette.mid);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const outline = f.palette.outline;

  if (f.reduced) {
    paintCocoon(c, f, 1, -1);
    paintCrown(c, f, true);
    c.flush(sink, outline);
    return;
  }

  switch (f.phase) {
    case 'gather': {
      paintThreads(c, f, f.t);
      // Las primeras vueltas ya rodean los pies
      paintCocoon(c, f, span(f.t, 0.6, 1) * 0.18, -1);
      break;
    }
    case 'weave': {
      paintCocoon(c, f, 0.18 + easeOut(f.t) * 0.82, -1);
      // Dos hebras siguen dando vueltas por encima del frente
      if (f.t < 0.85) {
        const a = f.t * Math.PI * 6;
        for (const k of [0, Math.PI]) {
          const x = CX + Math.cos(a + k) * (RX + 2);
          const y = FEET - (0.18 + easeOut(f.t) * 0.82) * (FEET - TOP) - 2 + Math.sin(a + k) * 2;
          c.set(x, y, f.palette.glow);
          c.set(x - Math.sign(Math.sin(a + k)), y, f.palette.light);
        }
      }
      break;
    }
    case 'hold': {
      // Late: un anillo de luz sube cada 700 ms
      const beat = (f.time % 700) / 700;
      paintCocoon(c, f, 1, beat < 0.55 ? beat / 0.55 : -1);
      paintCrown(c, f, Math.floor(f.time / 350) % 2 === 0);
      break;
    }
    case 'burst': {
      // Grietas de luz desde el centro (primer tercio), luego los jirones salen despedidos.
      const crack = span(f.t, 0, 0.35);
      const fly = span(f.t, 0.35, 1);
      for (let y = TOP - 1; y <= FEET; y++) {
        for (let x = CX - RX - 4; x <= CX + RX + 4; x++) {
          if (!inCocoon(x, y)) continue;
          const bx = Math.floor(x / 5);
          const by = Math.floor(y / 6);
          const h = hash(bx, by, f.seed);
          let color = silk(f, x, y, -1);
          // Grietas: líneas en zigzag que parten del centro
          const ang = Math.atan2(y - CY, x - CX);
          const rr = Math.hypot((x - CX) / RX, (y - CY) / RY);
          const ray = Math.abs(Math.sin(ang * 3 + Math.floor(rr * 4) * 0.6));
          if (ray < 0.12 && rr < crack * 1.1) color = f.palette.glow;
          if (fly <= 0) {
            c.set(x, y, color);
            continue;
          }
          // Cada jirón vuela hacia fuera a su ritmo, encoge hacia su centro y se apaga
          const local = span(fly, h * 0.3, h * 0.3 + 0.7);
          if (hash(by, bx, f.seed + 3) < easeIn(local) * 1.1) continue;
          const pcx = bx * 5 + 2;
          const pcy = by * 6 + 3;
          // Encoge: solo quedan los píxeles cercanos al centro del jirón
          const keep = 1 - local * 0.8;
          if (Math.abs(x - pcx) > 2.5 * keep || Math.abs(y - pcy) > 3 * keep) continue;
          const dir = Math.atan2(pcy - CY, pcx - CX) + (h - 0.5) * 0.9;
          const d = easeOut(local) * (16 + h * 14);
          c.set(x + Math.cos(dir) * d, y + Math.sin(dir) * d + easeIn(local) * 10, local > 0.55 ? f.palette.light : color);
        }
      }
      paintCrown(c, f, true);
      break;
    }
    case 'vanish': {
      // Motas del Flujo que suben y se apagan alrededor de la nueva forma
      for (let k = 0; k < 16; k++) {
        if (hash(k, 9, f.seed) < f.t * 1.1) continue;
        const x = CX - RX - 2 + hash(k, 2, f.seed) * (RX * 2 + 4);
        const y = FEET - 6 - hash(k, 3, f.seed) * (FEET - TOP) - easeOut(f.t) * 18;
        const blink = Math.floor(f.time / 120 + k) % 3 === 0;
        c.set(x, y, blink ? f.palette.glow : f.palette.light);
        if (k % 3 === 0) c.set(x, y + 1, f.palette.mid);
      }
      // Un anillo en el suelo que se abre
      const rr = 10 + easeOut(f.t) * 18;
      if (f.t < 0.7) {
        for (let a = 0; a < Math.PI * 2; a += 0.08) {
          c.set(CX + Math.cos(a) * rr, FEET + 1 + Math.sin(a) * 2, f.t < 0.35 ? f.palette.light : f.palette.mid);
        }
      }
      break;
    }
  }
  c.flush(sink, outline);
}

export const capulloTelar: EffectDef = {
  id: 'capullo-telar',
  lore: 'El Telar de Mulberry envuelve al Pockai en un capullo de hebras y lo vuelve a tejer en su nueva etapa (LORE §1, §6).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { center: { x: CX, y: CY } },
  layer: 'front',
  priority: 3,
  phases: [
    { name: 'gather', ms: 600 },
    { name: 'weave', ms: 700 },
    { name: 'hold', ms: 'hold' },
    { name: 'burst', ms: 560 },
    { name: 'vanish', ms: 560 },
  ],
  reducedPhases: [
    { name: 'gather', ms: 0 },
    { name: 'weave', ms: 220 },
    { name: 'hold', ms: 'hold' },
    { name: 'burst', ms: 0 },
    { name: 'vanish', ms: 220 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'weave') return f.t;
    if (f.phase === 'vanish') return 1 - f.t;
    return 1;
  },
};
