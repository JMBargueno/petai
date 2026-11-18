import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash, invert, span } from './fxMath';

/**
 * Trenza del Juramento: el clan cumple su juramento (LORE §8: cumplir un Juramento del Nexo «tensa
 * el trenzado»).
 *
 * Cinco hebras de colores distintos —una por Custodio: la del Pockai y las de sus compañeros— bajan
 * y se trenzan en un arco sobre la mascota; al cumplirse, la trenza se tensa recta y brilla de punta
 * a punta, y se suelta en motas.
 *
 * Colores: los tres tonos del Flujo propio, su complementario y dos fijos de clan (sol y menta).
 * Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS de la mascota.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const ARC = { x: CX, y: 64, r: 27 };
const STRANDS = 5;

function strandColors(f: FxFrame): string[] {
  return [f.palette.mid, '#ffd731', invert(f.palette.mid), '#55db9c', f.palette.light];
}

/** Posición sobre el arco (s 0..1, de pie izquierdo a pie derecho) con desfase radial. */
function onArc(s: number, off: number) {
  const a = Math.PI - s * Math.PI;
  const r = ARC.r + off;
  return [ARC.x - 0.5 + Math.cos(a) * r, ARC.y - Math.sin(a) * r * 1.05] as const;
}

function paintBraid(c: Canvas2, f: FxFrame, reach: number, slack: number, glow: number) {
  const cols = strandColors(f);
  const steps = 140;
  for (let k = 0; k < STRANDS; k++) {
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      // Las hebras bajan desde la clave del arco hacia los dos pies
      if (Math.abs(s - 0.5) > reach * 0.5) continue;
      const phase = s * Math.PI * 12 + (k * Math.PI * 2) / STRANDS + f.time / 300;
      const off = Math.sin(phase) * 2.5 * slack;
      const [x, y] = onArc(s, off);
      const front = Math.cos(phase) > 0;
      const lit = glow > 0 && Math.abs(s - span(glow, 0, 1)) < 0.06;
      if (!front && slack > 0.3 && hash(i, k, f.seed) < 0.4) continue;
      c.set(x, y, lit ? f.palette.glow : cols[k]);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);

  if (f.reduced) {
    paintBraid(c, { ...f, time: 0 }, 1, 0, 0);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'gather':
      paintBraid(c, f, easeOut(f.t), 1, 0);
      break;
    case 'braid':
      paintBraid(c, f, 1, 1 - f.t * 0.3, 0);
      break;
    case 'tense':
      // Se tensa: el vaivén desaparece y una luz recorre la trenza de punta a punta
      paintBraid(c, f, 1, 0.7 * (1 - easeOut(f.t)), f.t);
      break;
    case 'release':
      for (let k = 0; k < 18; k++) {
        if (hash(k, 3, f.seed) < f.t) continue;
        const [x, y] = onArc(hash(k, 1, f.seed), 0);
        c.set(x, y - easeOut(f.t) * 10, strandColors(f)[k % STRANDS]);
      }
      break;
  }
  c.flush(sink, f.palette.outline);
}

export const trenzaJuramento: EffectDef = {
  id: 'trenza-juramento',
  lore: 'Las hebras del clan se trenzan sobre el Pockai y el Juramento cumplido tensa el trenzado (LORE §8).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { top: { x: CX, y: ARC.y - ARC.r } },
  layer: 'behind',
  priority: 2,
  phases: [
    { name: 'gather', ms: 520 },
    { name: 'braid', ms: 620 },
    { name: 'tense', ms: 520 },
    { name: 'release', ms: 420 },
  ],
  reducedPhases: [
    { name: 'gather', ms: 200 },
    { name: 'braid', ms: 1000 },
    { name: 'tense', ms: 0 },
    { name: 'release', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'gather') return f.t;
    if (f.phase === 'release') return 1 - f.t;
    return 1;
  },
};
