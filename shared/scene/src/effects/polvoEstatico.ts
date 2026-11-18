import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash } from './fxMath';

/**
 * Polvo estático: el baño (LORE §6: la higiene baja como «polvo estático» que se le acumula).
 *
 * Al limpiarlo, chispas de estática grises saltan del cuerpo en zigzag y se apagan. El polvo es
 * polvo (rampa fija gris), no el Flujo del Pockai. Efecto menor.
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BODY = { x: CX, y: 54 };
const DUST = { outline: '#2a2a36', mid: '#8c8ca0', light: '#d6d6e2', glow: '#ffffff' };

function paintSpark(c: Canvas2, x: number, y: number, len: number, a: number, lit: boolean) {
  let px = x;
  let py = y;
  for (let i = 0; i < len; i++) {
    // Zigzag: alterna un paso a cada lado de la dirección
    const zig = i % 2 ? 1 : -1;
    px += Math.cos(a) + Math.cos(a + Math.PI / 2) * zig * 0.8;
    py += Math.sin(a) + Math.sin(a + Math.PI / 2) * zig * 0.8;
    c.set(px, py, i === len - 1 ? (lit ? DUST.glow : DUST.light) : DUST.mid);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const n = 10;

  if (f.reduced) {
    for (let k = 0; k < n; k += 2) {
      const a = (k / n) * Math.PI * 2;
      paintSpark(c, BODY.x + Math.cos(a) * 14, BODY.y + Math.sin(a) * 14, 3, a, true);
    }
    c.flush(sink, DUST.outline);
    return;
  }

  const fade = f.phase === 'fade' ? f.t : 0;
  for (let k = 0; k < n; k++) {
    if (hash(k, 2, f.seed) < fade) continue;
    const start = hash(k, 1, f.seed) * 0.5;
    const local = f.phase === 'zap' ? Math.max(0, Math.min(1, (f.t - start) / 0.5)) : 1;
    if (local <= 0) continue;
    const a = (k / n) * Math.PI * 2 + hash(k, 3, f.seed);
    const r = 10 + easeOut(local) * 12;
    const lit = Math.floor(f.time / 83 + k) % 2 === 0;
    paintSpark(c, BODY.x + Math.cos(a) * r, BODY.y + Math.sin(a) * r * 0.9, 2 + Math.round(local * 3), a, lit);
  }
  c.flush(sink, DUST.outline);
}

export const polvoEstatico: EffectDef = {
  id: 'polvo-estatico',
  lore: 'Al bañarlo salta el polvo estático que se le había acumulado (LORE §6).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { body: BODY },
  layer: 'front',
  channel: 'minor',
  phases: [
    { name: 'zap', ms: 700 },
    { name: 'fade', ms: 300 },
  ],
  reducedPhases: [
    { name: 'zap', ms: 500 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'fade' ? 1 - f.t : 1;
  },
};
