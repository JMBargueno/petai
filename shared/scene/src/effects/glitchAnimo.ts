import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, hash } from './fxMath';

/**
 * Glitch de ánimo: el Pockai enferma (LORE §7: el descuido le provoca «interferencias», glitches de
 * ánimo).
 *
 * Sobre la mascota pasan franjas de interferencia —líneas de scanline tramadas y trozos desplazados
 * de 1-2 px— a ratos, durante un segundo y medio. Sin destellos fuertes ni parpadeo rápido (a 6 fps
 * efectivos y sin blanco puro), por accesibilidad; con movimiento reducido, una sola franja quieta.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE. Efecto menor.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const X0 = 12;
const X1 = 52;
const Y0 = 24;

function band(c: Canvas2, f: FxFrame, y: number, shift: number, dense: boolean) {
  for (let x = X0; x < X1; x++) {
    if (!dense && (x + y) % 2) continue;
    c.set(x + shift, y, (x >> 2) % 3 === 0 ? f.palette.light : f.palette.deep);
  }
}

/** Sin contorno: es interferencia sobre la imagen, no un objeto. */
function copy(c: Canvas2, sink: PixelSink) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const col = c.get(x, y);
    if (col) sink.set(x, y, col);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);

  if (f.reduced) {
    band(c, f, 50, 0, false);
    copy(c, sink);
    return;
  }

  // Cambia cada 2 frames (≈6 fps): interferencia, no estroboscopio
  const tick = Math.floor(f.time / 166);
  const fade = f.phase === 'fade' ? 1 - f.t : 1;
  const n = Math.round(4 * fade);
  for (let k = 0; k < n; k++) {
    const y = Y0 + Math.floor(hash(k, tick, f.seed) * (FEET - Y0));
    const shift = hash(tick, k, f.seed) < 0.5 ? -2 : 2;
    band(c, f, y, shift, k === 0);
    if (k === 0) band(c, f, y + 1, -shift, false);
  }
  // Píxeles muertos sueltos
  for (let k = 0; k < 6 * fade; k++) {
    c.set(X0 + hash(k, tick + 9, f.seed) * (X1 - X0), Y0 + hash(tick, k + 9, f.seed) * (FEET - Y0), f.palette.mid);
  }
  copy(c, sink);
}

export const glitchAnimo: EffectDef = {
  id: 'glitch-animo',
  lore: 'Las interferencias del ánimo de un Pockai enfermo se ven como franjas que lo atraviesan (LORE §7).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: {},
  layer: 'front',
  channel: 'minor',
  phases: [
    { name: 'glitch', ms: 1500 },
    { name: 'fade', ms: 300 },
  ],
  reducedPhases: [
    { name: 'glitch', ms: 900 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (f.phase === 'fade') return 1 - f.t;
    return 1;
  },
};
