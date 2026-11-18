import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash, invert } from './fxMath';

/**
 * Confeti de Códices: las misiones del día, completas (LORE §1: la Resonancia de lo que haces
 * atrae Códices del Telar; spec 01 pide confeti).
 *
 * Una lluvia de rombos-Códice brota sobre la mascota y cae girando (rombo ↔ canto, 2 frames), en
 * los tonos del Flujo y su complementario.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const N = 22;

function codex(c: Canvas2, x: number, y: number, flat: boolean, col: string, shine: string) {
  if (flat) {
    for (let i = -1; i <= 1; i++) c.set(x, y + i, col);
    c.set(x, y - 1, shine);
    return;
  }
  c.set(x, y - 1, shine);
  c.set(x - 1, y, col);
  c.set(x, y, col);
  c.set(x + 1, y, col);
  c.set(x, y + 1, col);
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const cols = [f.palette.mid, f.palette.light, invert(f.palette.mid), f.palette.glow];
  const total = f.phase === 'pop' ? f.t * 0.2 : f.phase === 'fall' ? 0.2 + f.t * 0.8 : 1;
  const fade = f.phase === 'fade' ? f.t : 0;

  for (let k = 0; k < N; k++) {
    if (fade > 0 && hash(k, 7, f.seed) < fade) continue;
    const vx = (hash(k, 1, f.seed) - 0.5) * 50;
    const up = 10 + hash(k, 2, f.seed) * 14;
    const t = f.reduced ? 0.5 : total;
    // Sube un poco (pop) y luego cae con vaivén
    const x = CX + vx * easeOut(Math.min(1, t * 2)) + Math.sin(t * 9 + k) * 2;
    const y = 30 - up * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) + Math.max(0, t - 0.33) * 70 * (0.7 + hash(k, 3, f.seed) * 0.6);
    if (y > FEET) continue;
    const flat = !f.reduced && Math.floor(f.time / 166 + k) % 2 === 0;
    codex(c, Math.round(x), Math.round(y), flat, cols[k % cols.length], f.palette.glow);
  }
  c.flush(sink, f.palette.outline);
}

export const confetiCodices: EffectDef = {
  id: 'confeti-codices',
  lore: 'La Resonancia de un día completo atrae una lluvia de Códices del Telar (LORE §1).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: {},
  layer: 'front',
  priority: 2,
  phases: [
    { name: 'pop', ms: 300 },
    { name: 'fall', ms: 1400 },
    { name: 'fade', ms: 300 },
  ],
  reducedPhases: [
    { name: 'pop', ms: 0 },
    { name: 'fall', ms: 900 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'fade' ? 1 - f.t : 1;
  },
};
