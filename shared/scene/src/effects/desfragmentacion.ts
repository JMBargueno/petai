import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash } from './fxMath';

/**
 * Desfragmentación: el Pockai se duerme (LORE §6: dormir es su «Modo de Desfragmentación»).
 *
 * Bloques de datos desordenados alrededor de la mascota se colocan, uno a uno, en columnas
 * ordenadas a sus lados (como la barra de un desfragmentador) y luego se apagan de arriba abajo.
 * Efecto menor. Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BLOCKS = 16;
const COLS = [8, 12, 52, 56];

/** Destino ordenado del bloque k: cuatro columnas, de abajo arriba. */
function slot(k: number) {
  const col = k % COLS.length;
  const row = Math.floor(k / COLS.length);
  return { x: COLS[col] - 1, y: FEET - 4 - row * 4 };
}

function paintBlock(c: Canvas2, f: FxFrame, x: number, y: number, k: number) {
  const tone = [f.palette.deep, f.palette.mid, f.palette.light][k % 3];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) c.set(x + dx, y + dy, dx === 0 && dy === 0 ? f.palette.light : tone);
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);

  if (f.reduced) {
    for (let k = 0; k < BLOCKS; k++) {
      const s = slot(k);
      paintBlock(c, f, s.x, s.y, k);
    }
    c.flush(sink, f.palette.outline);
    return;
  }

  for (let k = 0; k < BLOCKS; k++) {
    const s = slot(k);
    const from = { x: 6 + hash(k, 1, f.seed) * 50, y: 30 + hash(k, 2, f.seed) * 40 };
    if (f.phase === 'sort') {
      // Cada bloque viaja a su sitio en orden
      const local = Math.max(0, Math.min(1, (f.t - k / BLOCKS / 1.6) * 2.2));
      const e = easeOut(local);
      paintBlock(c, f, Math.round(from.x + (s.x - from.x) * e), Math.round(from.y + (s.y - from.y) * e), k);
    } else {
      // Se apagan de arriba abajo
      const order = (BLOCKS - 1 - k) / BLOCKS;
      if (f.t > order) continue;
      paintBlock(c, f, s.x, s.y, k);
    }
  }
  c.flush(sink, f.palette.outline);
}

export const desfragmentacion: EffectDef = {
  id: 'desfragmentacion',
  lore: 'Al dormirse entra en Modo de Desfragmentación: sus bloques de datos se ordenan y se apagan (LORE §6).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: {},
  layer: 'behind',
  channel: 'minor',
  phases: [
    { name: 'sort', ms: 1000 },
    { name: 'dim', ms: 700 },
  ],
  reducedPhases: [
    { name: 'sort', ms: 600 },
    { name: 'dim', ms: 300 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'dim' ? 1 - f.t : 1;
  },
};
