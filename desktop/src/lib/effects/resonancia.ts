import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash, span } from './fxMath';

/**
 * Resonancia: subida de nivel (LORE §1: la Resonancia de lo que haces con tu Pockai es lo que
 * atrae Códices del Telar).
 *
 * Tres ondas se abren a ras de suelo, dos columnas de pulsos suben a los lados de la mascota y un
 * Códice —rombo con su glifo— asciende por detrás hasta por encima de la cabeza, donde se parte en
 * destellos. Va DETRÁS de la mascota y la sigue mientras dura.
 *
 * Rejilla 64×80 ×2; pies en la fila 76.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const TOP_Y = 8;

/** Códice: rombo de 7×9 con un glifo vertical en el centro. */
function paintCodex(c: Canvas2, f: FxFrame, cy: number, lit: boolean) {
  const { palette } = f;
  const rows = [1, 2, 3, 4, 3, 2, 1];
  rows.forEach((half, i) => {
    const y = Math.round(cy) - 3 + i;
    for (let dx = -half + 1; dx <= half; dx++) {
      const x = CX + dx - 1;
      const edge = dx === -half + 1 || dx === half;
      let col = edge ? palette.light : palette.mid;
      if (dx === 0 || dx === 1) col = i === 3 ? (lit ? palette.glow : palette.light) : palette.deep;
      c.set(x, y, col);
    }
  });
}

function paintRipples(c: Canvas2, f: FxFrame, t: number) {
  const { palette } = f;
  for (let k = 0; k < 3; k++) {
    const local = span(t, k * 0.22, k * 0.22 + 0.56);
    if (local <= 0 || local >= 1) continue;
    const rx = 8 + easeOut(local) * 24;
    const ry = Math.max(1.2, rx * 0.16);
    const col = local < 0.35 ? palette.glow : local < 0.7 ? palette.light : palette.mid;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      if (local > 0.7 && hash(Math.round(a * 20), k, f.seed) < (local - 0.7) * 3) continue;
      c.set(CX + Math.cos(a) * rx - 0.5, FEET + Math.sin(a) * ry, col);
    }
  }
}

/** Pulsos que suben por dos columnas a los lados de la mascota. */
function paintColumns(c: Canvas2, f: FxFrame, t: number) {
  const { palette } = f;
  for (const side of [-1, 1]) {
    const x = CX + side * 23 - (side > 0 ? 1 : 0);
    for (let k = 0; k < 4; k++) {
      const y = FEET - 4 - ((t * 1.4 + k * 0.25) % 1) * (FEET - TOP_Y - 10);
      if (y > FEET - 2) continue;
      c.set(x, y, palette.glow);
      c.set(x, y + 1, palette.light);
      c.set(x, y + 2, palette.mid);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);

  if (f.reduced) {
    paintCodex(c, f, TOP_Y + 4, true);
    for (let a = 0; a < Math.PI * 2; a += 0.05) c.set(CX + Math.cos(a) * 20 - 0.5, FEET + Math.sin(a) * 3, f.palette.light);
    c.flush(sink, f.palette.outline);
    return;
  }

  const lit = Math.floor(f.time / 166) % 2 === 0;
  switch (f.phase) {
    case 'ripple':
      paintRipples(c, f, f.t);
      if (f.t > 0.5) paintCodex(c, f, FEET - 4, lit);
      break;
    case 'rise': {
      paintRipples(c, f, 0.6 + f.t * 0.4);
      paintColumns(c, f, f.t);
      const cy = FEET - 4 - easeOut(f.t) * (FEET - 4 - (TOP_Y + 4));
      // Estela del Códice
      for (let i = 1; i <= 6; i++) {
        const y = cy + 4 + i * 2;
        if (y < FEET && hash(i, Math.floor(f.time / 83), f.seed) < 0.8) c.set(CX - (i % 2), y, i < 3 ? f.palette.light : f.palette.mid);
      }
      paintCodex(c, f, cy, lit);
      break;
    }
    case 'burst': {
      const cy = TOP_Y + 4;
      if (f.t < 0.25) paintCodex(c, f, cy, true);
      // Ocho destellos en cruz que salen del Códice
      for (let k = 0; k < 8; k++) {
        if (hash(k, 5, f.seed) < span(f.t, 0.4, 1)) continue;
        const a = (k / 8) * Math.PI * 2;
        const d = 3 + easeOut(f.t) * 16;
        const x = CX - 0.5 + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d * 0.8;
        const col = f.t < 0.5 ? f.palette.glow : f.palette.light;
        c.set(x, y, col);
        if (k % 2 === 0) {
          c.set(x - 1, y, f.palette.mid);
          c.set(x + 1, y, f.palette.mid);
          c.set(x, y - 1, f.palette.mid);
          c.set(x, y + 1, f.palette.mid);
        }
      }
      break;
    }
  }
  c.flush(sink, f.palette.outline);
}

export const resonancia: EffectDef = {
  id: 'resonancia',
  lore: 'La Resonancia de lo vivido con el Pockai sube como un Códice hacia el Telar (LORE §1).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { top: { x: CX, y: TOP_Y + 4 } },
  layer: 'behind',
  priority: 2,
  phases: [
    { name: 'ripple', ms: 520 },
    { name: 'rise', ms: 760 },
    { name: 'burst', ms: 520 },
  ],
  reducedPhases: [
    { name: 'ripple', ms: 200 },
    { name: 'rise', ms: 700 },
    { name: 'burst', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'ripple') return f.t;
    if (f.phase === 'burst') return 1 - f.t;
    return 1;
  },
};
