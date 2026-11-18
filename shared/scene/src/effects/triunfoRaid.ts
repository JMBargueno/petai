import type { EffectDef, FxFrame, FxPalette, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { flowPalette } from './palettes';

/**
 * Triunfo de raid: el jefe cae (spec 13: celebración al derrotarlo; LORE §4, cada jefe es un
 * Flujo desbocado de su elemento).
 *
 * Sobre la mascota aparece la silueta del jefe —un orbe astado en el Flujo de SU elemento
 * (`params.element`)—, se resquebraja con grietas de luz y estalla en esquirlas que llueven; en su
 * lugar queda una corona de laurel de luz en el Flujo del Pockai, que celebró la victoria.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BOSS = { x: CX, y: 22, r: 12 };
const CROWN_Y = 28;

function inBoss(x: number, y: number) {
  const d = Math.hypot(x + 0.5 - BOSS.x, y + 0.5 - BOSS.y);
  if (d <= BOSS.r) return true;
  // Cuernos
  for (const side of [-1, 1]) {
    const hx = BOSS.x + side * 9;
    for (let i = 0; i < 6; i++) {
      if (Math.abs(x + 0.5 - (hx + side * i * 0.6)) < 1.5 - i * 0.2 && Math.abs(y + 0.5 - (BOSS.y - BOSS.r + 2 - i)) < 1) return true;
    }
  }
  return false;
}

function paintBoss(c: Canvas2, p: FxPalette, crack: number, seed: number) {
  for (let y = 0; y < BOSS.y + BOSS.r + 1; y++) {
    for (let x = 0; x < W; x++) {
      if (!inBoss(x, y)) continue;
      const eye = (Math.abs(x + 0.5 - (BOSS.x - 4)) < 1.5 || Math.abs(x + 0.5 - (BOSS.x + 4)) < 1.5) && Math.abs(y + 0.5 - BOSS.y) < 1;
      let col = eye ? p.glow : (x + y) % 3 === 0 ? p.mid : p.deep;
      if (crack > 0) {
        const ang = Math.atan2(y - BOSS.y, x - BOSS.x);
        const rr = Math.hypot(x - BOSS.x, y - BOSS.y) / BOSS.r;
        if (Math.abs(Math.sin(ang * 4 + Math.floor(rr * 3) * 0.8 + (seed % 5))) < 0.14 && rr < crack * 1.2) col = p.glow;
      }
      c.set(x, y, col);
    }
  }
}

function paintCrown(c: Canvas2, f: FxFrame, grow: number) {
  const { palette } = f;
  const leaves = Math.round(grow * 7);
  for (const side of [-1, 1]) {
    for (let i = 0; i < leaves; i++) {
      const a = Math.PI / 2 + side * (0.4 + i * 0.32);
      const x = CX - 0.5 + Math.cos(a) * 10;
      const y = CROWN_Y + Math.sin(a) * -4 + i * 0.6;
      c.set(x, y, i % 2 ? palette.light : palette.mid);
      c.set(x + side, y - 1, palette.light);
    }
  }
  if (grow >= 1) c.set(CX - 0.5, CROWN_Y - 5, palette.glow);
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const boss = flowPalette(String(f.params['element'] ?? ''));

  if (f.reduced) {
    paintCrown(c, f, 1);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'appear': {
      const tmp = new Canvas2(W, H);
      paintBoss(tmp, boss, 0, f.seed);
      // Aparece tramado: cada vez más píxeles
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const col = tmp.get(x, y);
        if (col && hash(x, y, f.seed) < easeOut(f.t)) c.set(x, y, col);
      }
      break;
    }
    case 'crack':
      paintBoss(c, boss, f.t, f.seed);
      break;
    case 'shatter': {
      for (let y = 0; y < BOSS.y + BOSS.r + 1; y++) {
        for (let x = 0; x < W; x++) {
          if (!inBoss(x, y)) continue;
          const bx = x >> 2;
          const by = y >> 2;
          const h = hash(bx, by, f.seed);
          if (h < span(f.t, 0.3, 1)) continue;
          const a = Math.atan2(y - BOSS.y, x - BOSS.x) + (h - 0.5);
          const d = easeOut(f.t) * (6 + h * 12);
          c.set(x + Math.cos(a) * d, y + Math.sin(a) * d + easeIn(f.t) * 30, (bx + by) % 2 ? boss.mid : boss.light);
        }
      }
      break;
    }
    case 'crown':
      paintCrown(c, f, easeOut(Math.min(1, f.t * 1.6)));
      if (f.t > 0.75 && Math.floor(f.time / 125) % 2) c.set(CX - 0.5, CROWN_Y - 6, f.palette.light);
      break;
  }
  // El jefe lleva el contorno de su Flujo; la corona, el del Pockai
  c.flush(sink, f.phase === 'crown' ? f.palette.outline : boss.outline);
}

export const triunfoRaid: EffectDef = {
  id: 'triunfo-raid',
  lore: 'El jefe, un Flujo desbocado de su elemento, se resquebraja y queda una corona de luz para el Pockai (LORE §4).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { boss: { x: BOSS.x, y: BOSS.y } },
  layer: 'front',
  priority: 3,
  phases: [
    { name: 'appear', ms: 400 },
    { name: 'crack', ms: 500 },
    { name: 'shatter', ms: 600 },
    { name: 'crown', ms: 700 },
  ],
  reducedPhases: [
    { name: 'appear', ms: 0 },
    { name: 'crack', ms: 0 },
    { name: 'shatter', ms: 0 },
    { name: 'crown', ms: 1200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'crown' ? Math.min(1, (1 - f.t) * 3) : 1;
  },
};
