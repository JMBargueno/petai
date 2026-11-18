import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';

/**
 * Huevo con grietas de luz: la eclosión vista en el escritorio (LORE §1: el Telar cristaliza el
 * Códice y la eclosión «descomprime la visualSeed»).
 *
 * Un huevo de pixel art se zarandea (fase `hold`, que se llama así para que el motor la suelte: dura lo que el panel tarde en recibir a la
 * recién nacida); cuando llegan las grietas, la luz del Flujo de la recién nacida se cuela por
 * ellas cada vez con más fuerza y el huevo estalla en esquirlas. La cáscara es cáscara (rampa fija);
 * la luz es del Flujo, y quien lo lanza puede cambiar la paleta al llegar a `crack`.
 *
 * Rejilla 40×56 ×2; pies en la fila 53. Va DETRÁS, al lado de la mascota.
 */

const W = 40;
const H = 56;
const CX = 20;
const FEET = 53;
const EGG = { x: CX, y: 39, rx: 11, ry: 14 };
const SHELL = { outline: '#4a3b2a', deep: '#c9b48a', mid: '#efe2c0', light: '#fff8e6' };

function inEgg(x: number, y: number, ox = 0) {
  const dx = (x + 0.5 - EGG.x - ox) / EGG.rx;
  const dy = (y + 0.5 - EGG.y) / EGG.ry;
  // Más estrecho arriba, como un huevo
  const k = dy < 0 ? 1 + -dy * 0.25 : 1;
  return dx * dx * k * k + dy * dy <= 1;
}

/** Grietas: zigzags que bajan desde la parte alta; `reach` 0..1 cuánto han avanzado. */
function crackAt(x: number, y: number, reach: number, seed: number) {
  for (let k = 0; k < 3; k++) {
    const x0 = EGG.x - 6 + k * 6;
    const len = Math.round(reach * (14 + k * 3));
    const top = EGG.y - EGG.ry + 3;
    if (y < top || y > top + len) continue;
    const zig = Math.round(Math.sin((y - top) * 0.9 + k + seed % 7) * 1.5);
    if (Math.abs(x - (x0 + zig)) < 1) return true;
  }
  return false;
}

function paintEgg(c: Canvas2, f: FxFrame, ox: number, crack: number, light: number) {
  const { palette } = f;
  for (let y = EGG.y - EGG.ry - 2; y <= FEET; y++) {
    for (let x = 0; x < W; x++) {
      if (!inEgg(x, y, ox)) continue;
      const shade = x + 0.5 - EGG.x - ox < -4 && y < EGG.y ? SHELL.light : x + 0.5 - EGG.x - ox > 5 ? SHELL.deep : SHELL.mid;
      const spot = hash(x - ox, y, 3) < 0.05 ? SHELL.deep : shade;
      if (crack > 0 && crackAt(x - ox, y, crack, f.seed)) {
        c.set(x, y, light > 0.5 ? palette.glow : palette.light);
        // La luz se escapa alrededor de la grieta
        if (light > 0.3 && hash(x, y, f.seed) < light * 0.5) c.set(x + 1, y, palette.mid);
        continue;
      }
      c.set(x, y, spot);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  if (f.reduced) {
    paintEgg(c, f, 0, 1, 0.6);
    c.flush(sink, SHELL.outline);
    return;
  }
  const wobble = (amp: number) => (Math.floor(f.time / 166) % 2 === 0 ? amp : -amp);
  switch (f.phase) {
    case 'hold': // tiembla mientras espera a saber quién nace
      paintEgg(c, f, Math.floor(f.time / 500) % 2 === 0 ? wobble(1) : 0, 0, 0);
      break;
    case 'crack': {
      const ox = f.t > 0.6 ? wobble(1) : 0;
      paintEgg(c, f, ox, easeOut(f.t), f.t);
      // Rayos de luz que salen por arriba
      if (f.t > 0.5) {
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k - 2) * 0.4;
          for (let i = EGG.ry - 2; i < EGG.ry + 2 + span(f.t, 0.5, 1) * 6; i++) {
            c.set(EGG.x - 0.5 + Math.cos(a) * i, EGG.y + Math.sin(a) * i, f.palette.light);
          }
        }
      }
      break;
    }
    case 'burst': {
      // Esquirlas de cáscara despedidas y un anillo de luz
      for (let y = EGG.y - EGG.ry - 2; y <= FEET; y++) {
        for (let x = 0; x < W; x++) {
          if (!inEgg(x, y)) continue;
          const bx = x >> 2;
          const by = y >> 2;
          const h = hash(bx, by, f.seed);
          if (h < f.t * 1.1) continue;
          const a = Math.atan2(y - EGG.y, x - EGG.x) + (h - 0.5);
          const d = easeOut(f.t) * (8 + h * 10);
          c.set(x + Math.cos(a) * d, y + Math.sin(a) * d + easeIn(f.t) * 6, (bx + by) % 2 ? SHELL.mid : SHELL.light);
        }
      }
      const r = 4 + easeOut(f.t) * 16;
      if (f.t < 0.7) for (let a = 0; a < Math.PI * 2; a += 0.1) c.set(EGG.x - 0.5 + Math.cos(a) * r, EGG.y + Math.sin(a) * r, f.palette.glow);
      break;
    }
  }
  c.flush(sink, SHELL.outline);
}

export const huevoGrietas: EffectDef = {
  id: 'huevo-grietas',
  lore: 'El Códice cristalizado por el Telar se agrieta con la luz del Flujo de quien va a nacer (LORE §1).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { egg: { x: EGG.x, y: EGG.y } },
  layer: 'behind',
  priority: 3,
  phases: [
    { name: 'hold', ms: 'hold' },
    { name: 'crack', ms: 1200 },
    { name: 'burst', ms: 600 },
  ],
  reducedPhases: [
    { name: 'hold', ms: 'hold' },
    { name: 'crack', ms: 600 },
    { name: 'burst', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'burst' ? 1 - f.t : 1;
  },
};
