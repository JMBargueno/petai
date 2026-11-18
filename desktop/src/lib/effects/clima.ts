import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, hash } from './fxMath';

/**
 * Clima: lluvia o nieve alrededor de la mascota (feature 005, estado ambiental; LORE §4, el agua es
 * Flujo de Datos, pero el tiempo del Custodio es el de su ventana: rampas fijas de agua y nieve).
 *
 * Sustituye al emoji de paraguas o copo: gotas en diagonal que salpican al llegar al suelo, o copos
 * que bajan meciéndose. `params.kind`: `rain`, `storm` (más densa y más inclinada) o `snow`.
 * Es de ambiente: se queda en la fase `hold` mientras dure el tiempo y PetView la suelta al cambiar.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS (la mascota queda «bajo» la lluvia).
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const RAIN = { outline: '#1d3a52', mid: '#7fb0e0', light: '#cfe8ff' };
const SNOW = { outline: '#5a7a94', mid: '#d4ecfa', light: '#ffffff' };

function paintRain(c: Canvas2, f: FxFrame, density: number, slant: number, time: number) {
  const drops = Math.round(26 * density);
  for (let k = 0; k < drops; k++) {
    const speed = 0.09 + hash(k, 1, f.seed) * 0.05; // px/ms
    const x0 = hash(k, 2, f.seed) * (W + 20) - 10;
    const span = FEET + 4;
    const y = (hash(k, 3, f.seed) * span + time * speed) % span;
    const x = x0 + y * slant;
    if (y >= FEET - 1) {
      // Salpicadura en el suelo
      c.set(x - 1, FEET - 1, RAIN.light);
      c.set(x + 1, FEET - 1, RAIN.light);
      continue;
    }
    c.set(x, y, RAIN.light);
    c.set(x - slant, y - 1, RAIN.mid);
    c.set(x - slant * 2, y - 2, RAIN.mid);
  }
}

function paintSnow(c: Canvas2, f: FxFrame, density: number, time: number) {
  const flakes = Math.round(18 * density);
  for (let k = 0; k < flakes; k++) {
    const speed = 0.02 + hash(k, 1, f.seed) * 0.015;
    const y = (hash(k, 3, f.seed) * FEET + time * speed) % FEET;
    const x = hash(k, 2, f.seed) * W + Math.sin(time / 600 + k) * 2;
    if (k % 3 === 0) {
      c.set(x, y, SNOW.light);
      c.set(x - 1, y, SNOW.mid);
      c.set(x + 1, y, SNOW.mid);
      c.set(x, y - 1, SNOW.mid);
      c.set(x, y + 1, SNOW.mid);
    } else c.set(x, y, SNOW.light);
  }
  // Un poco de nieve posada a ras de suelo
  for (let x = 8; x < W - 8; x++) if (hash(x, 9, f.seed) < 0.5 * density) c.set(x, FEET, SNOW.light);
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const kind = String(f.params.kind ?? 'rain');
  const time = f.reduced ? 0 : f.time;
  // Entra y sale poco a poco
  const density = f.phase === 'start' ? f.t : f.phase === 'stop' ? 1 - f.t : 1;
  if (kind === 'snow') {
    paintSnow(c, f, f.reduced ? 0.6 : density, time);
    c.flush(sink, SNOW.outline);
  } else {
    paintRain(c, f, (kind === 'storm' ? 1.6 : 1) * (f.reduced ? 0.6 : density), kind === 'storm' ? 0.5 : 0.25, time);
    c.flush(sink, RAIN.outline);
  }
}

export const clima: EffectDef = {
  id: 'clima',
  lore: 'La lluvia o la nieve del lugar del Custodio caen sobre su Santuario de Bolsillo (LORE §10; estado ambiental).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: {},
  layer: 'behind',
  channel: 'ambient',
  phases: [
    { name: 'start', ms: 600 },
    { name: 'hold', ms: 'hold' },
    { name: 'stop', ms: 600 },
  ],
  reducedPhases: [
    { name: 'start', ms: 300 },
    { name: 'hold', ms: 'hold' },
    { name: 'stop', ms: 300 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'start') return f.t;
    if (f.phase === 'stop') return 1 - f.t;
    return 1;
  },
};
