import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash } from './fxMath';

/**
 * Chispa del Despertar: la Sintonía Mental sube de nivel (LORE §5: la Chispa de Hermes; niveles
 * Susurro, Hilo de Ariadna a 200 y Simbiosis a 500).
 *
 * Una chispa baja del Nexo dejando estela, entra en la frente con un fogonazo y un halo de runas da
 * una vuelta alrededor de la cabeza; en Simbiosis (`params.level` = 3) son dos halos que giran en
 * sentidos contrarios.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE (la chispa entra en la cabeza).
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BROW = { x: CX, y: 40 };

function paintHalo(c: Canvas2, f: FxFrame, y: number, rx: number, turn: number, alpha: number) {
  const { palette } = f;
  const runes = 10;
  for (let k = 0; k < runes; k++) {
    if (hash(k, 5, f.seed) > alpha) continue;
    const a = turn + (k / runes) * Math.PI * 2;
    const front = Math.sin(a) > 0;
    const x = BROW.x - 0.5 + Math.cos(a) * rx;
    const yy = y + Math.sin(a) * rx * 0.25;
    // Runa de 3 px: un trazo vertical con brazo
    c.set(x, yy, front ? palette.glow : palette.mid);
    c.set(x, yy - 1, front ? palette.light : palette.deep);
    c.set(x + (k % 2 ? 1 : -1), yy - 1, front ? palette.light : palette.deep);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const level = Number(f.params.level ?? 2);
  const haloY = BROW.y - 10;

  if (f.reduced) {
    paintHalo(c, f, haloY, 18, 0, 1);
    if (level >= 3) paintHalo(c, f, haloY - 6, 13, 0.4, 1);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'descend': {
      const y = easeIn(f.t) * BROW.y;
      for (let i = 0; i < 10; i++) {
        const yy = y - i * 2;
        if (yy < 0) break;
        const wob = Math.round(Math.sin((yy + f.time / 40) * 0.4));
        c.set(BROW.x - 0.5 + wob, yy, i === 0 ? f.palette.glow : i < 3 ? f.palette.light : f.palette.mid);
      }
      break;
    }
    case 'enter': {
      // Fogonazo en la frente: cruz que se abre
      const r = 2 + easeOut(f.t) * 6;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let i = 0; i <= r; i++) c.set(BROW.x - 0.5 + dx * i, BROW.y + dy * i, i < r / 2 ? f.palette.glow : f.palette.light);
      }
      break;
    }
    case 'halo': {
      const turn = f.t * Math.PI * 2;
      const alpha = Math.min(1, f.t * 4);
      paintHalo(c, f, haloY, 18, turn, alpha);
      if (level >= 3) paintHalo(c, f, haloY - 6, 13, -turn * 1.3, alpha);
      break;
    }
    case 'fade':
      paintHalo(c, f, haloY - f.t * 6, 18 + f.t * 4, Math.PI * 2, 1 - f.t);
      break;
  }
  c.flush(sink, f.palette.outline);
}

export const chispaDespertar: EffectDef = {
  id: 'chispa-despertar',
  lore: 'La Chispa de Hermes entra en la frente y un halo de runas sella el nuevo nivel de Sintonía Mental (LORE §5).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { brow: BROW },
  layer: 'front',
  priority: 3,
  phases: [
    { name: 'descend', ms: 480 },
    { name: 'enter', ms: 260 },
    { name: 'halo', ms: 900 },
    { name: 'fade', ms: 360 },
  ],
  reducedPhases: [
    { name: 'descend', ms: 0 },
    { name: 'enter', ms: 0 },
    { name: 'halo', ms: 1200 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'fade') return 1 - f.t;
    return 1;
  },
};
