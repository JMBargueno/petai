import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, clamp01, easeIn, easeOut, hash } from './fxMath';

/**
 * Parpadeo del Éter: cuando le piden al Pockai varias cosas seguidas con un objeto del Éter (sacar
 * el reloj y guardarlo al momento), no le da tiempo a ir: el objeto parpadea y cambia de golpe,
 * como si el Éter lo hubiera tragado o escupido en un abrir y cerrar de ojos.
 *
 * Params: `dir` = `'in'` (se lo traga: chispas que convergen) u `'out'` (aparece: chispas que se
 * abren). Una sola fase muy corta. Con movimiento reducido, el destello quieto que se desvanece.
 *
 * Rejilla 32×32 ×2; el anclaje es el CENTRO del objeto. Efecto menor.
 */

const W = 32;
const H = 32;
const C = 16;
const SPARKS = 8;

function draw(sink: PixelSink, f: FxFrame): void {
  const { palette: p, seed } = f;
  const c = new Canvas2(W, H);
  const t = f.reduced ? 0.5 : f.t;
  const dirIn = f.params['dir'] !== 'out';

  for (let i = 0; i < SPARKS; i++) {
    const a = (i / SPARKS) * Math.PI * 2 + (hash(i, 4, seed) - 0.5) * 0.4;
    const r = dirIn ? 13 * (1 - easeIn(t)) : 3 + 11 * easeOut(t);
    if (r < 1.5) continue;
    const x = C + Math.cos(a) * r;
    const y = C + Math.sin(a) * r;
    c.set(x, y, p.glow);
    const back = dirIn ? 1.5 : -1.5;
    c.set(x + Math.cos(a) * back, y + Math.sin(a) * back, p.light);
  }

  // Destello central: crece hasta la mitad y se apaga
  const s = Math.round((t < 0.5 ? t * 2 : (1 - t) * 2) * 4);
  for (let d = -s; d <= s; d++) {
    const col = Math.abs(d) <= 1 ? p.glow : p.light;
    c.set(C + d, C, col);
    c.set(C, C + d, col);
  }
  if (s >= 2) {
    c.set(C - 1, C - 1, p.mid);
    c.set(C + 1, C + 1, p.mid);
    c.set(C - 1, C + 1, p.mid);
    c.set(C + 1, C - 1, p.mid);
  }

  c.flush(sink, p.outline);
}

export const parpadeoEter: EffectDef = {
  id: 'parpadeo-eter',
  lore: 'El Éter se traga o escupe un objeto en un abrir y cerrar de ojos cuando no le da tiempo al Pockai a ir a por él (LORE §2, el Éter).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: C, y: C },
  points: {},
  phases: [{ name: 'parpadeo', ms: 240 }],
  reducedPhases: [{ name: 'parpadeo', ms: 160 }],
  fps: 12,
  draw,
  channel: 'minor',
  layer: 'front',
  opacity(f) {
    return f.reduced ? clamp01(1 - f.t) : 1;
  },
};
