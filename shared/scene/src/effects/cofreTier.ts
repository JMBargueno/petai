import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash } from './fxMath';

/**
 * Cofre por tier: se abre un cofre (spec 02: brillo por tier y revelación; LORE §2, la densidad).
 *
 * Un cofre cae junto a la mascota, brilla con el color de su tipo (`params.type`: bronce, plata,
 * oro, diamante o mítico) y tiembla; la tapa salta y sube una columna de luz del color del mejor
 * drop (`params.bestTier`) con tantos destellos como su rango.
 *
 * Los metales y los tiers tienen rampas fijas: son el cofre y su botín, no el Pockai.
 * Rejilla 64×80 ×2; pies en la fila 76; el cofre cae a la derecha (x≈52). Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BX = 52;

type Ramp = { outline: string; deep: string; mid: string; light: string };
const METAL: Record<string, Ramp> = {
  bronze: { outline: '#3a200c', deep: '#a0632b', mid: '#d9924a', light: '#ffd08a' },
  silver: { outline: '#2a3040', deep: '#8a95a8', mid: '#c9d2e0', light: '#ffffff' },
  gold: { outline: '#4a3700', deep: '#c99a1a', mid: '#ffd731', light: '#fff4b0' },
  diamond: { outline: '#123c52', deep: '#4fb3d9', mid: '#a8ecff', light: '#ffffff' },
  mythic: { outline: '#2a1240', deep: '#7a3cc9', mid: '#d08aff', light: '#fff0ff' },
};
const TIER: Record<string, { color: string; rank: number }> = {
  common: { color: '#c9c9d6', rank: 1 },
  uncommon: { color: '#55db9c', rank: 2 },
  rare: { color: '#4da2ff', rank: 3 },
  epic: { color: '#b06bff', rank: 4 },
  legendary: { color: '#ffd731', rank: 5 },
};
const WOOD = { deep: '#5a3a22', mid: '#8a5a32' };

function paintChest(c: Canvas2, m: Ramp, bottom: number, lid: number, glow: boolean, shake: number) {
  const x0 = BX - 6 + shake;
  // Cuerpo: madera con flejes del metal del tipo
  for (let y = bottom - 6; y <= bottom; y++) {
    for (let x = x0; x < x0 + 12; x++) {
      const band = x === x0 || x === x0 + 11 || x === x0 + 5 || x === x0 + 6 || y === bottom - 6;
      c.set(x, y, band ? (glow ? m.light : m.mid) : (x + y) % 4 === 0 ? WOOD.deep : WOOD.mid);
    }
  }
  // Cerradura
  c.set(x0 + 5, bottom - 4, m.light);
  c.set(x0 + 6, bottom - 4, m.light);
  // Tapa (sube y se separa al abrirse)
  const ly = bottom - 7 - Math.round(lid * 8);
  const lx = x0 + Math.round(lid * 3);
  for (let y = ly - 3; y <= ly; y++) {
    for (let x = lx; x < lx + 12; x++) {
      const band = y === ly - 3 || x === lx || x === lx + 11;
      c.set(x, y, band ? (glow ? m.light : m.mid) : WOOD.mid);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const m = METAL[String(f.params['type'] ?? 'bronze')] ?? METAL['bronze']!;
  const tier = TIER[String(f.params['bestTier'] ?? 'common')] ?? TIER['common']!;

  if (f.reduced) {
    paintChest(c, m, FEET, 1, true, 0);
    c.flush(sink, m.outline);
    return;
  }

  switch (f.phase) {
    case 'drop':
      paintChest(c, m, Math.round(10 + easeIn(f.t) * (FEET - 10)), 0, false, 0);
      break;
    case 'glow': {
      const pulse = Math.floor(f.time / 125) % 2 === 0;
      paintChest(c, m, FEET, 0, pulse, f.t > 0.4 ? (pulse ? 1 : -1) : 0);
      break;
    }
    case 'open': {
      paintChest(c, m, FEET, easeOut(f.t), true, 0);
      // Columna del color del mejor drop, con un destello por rango
      const top = FEET - 7 - easeOut(f.t) * 50;
      for (let y = Math.round(top); y < FEET - 7; y++) {
        for (let x = BX - 2; x <= BX + 1; x++) c.set(x, y, Math.abs(x + 0.5 - BX) < 1 ? '#ffffff' : tier.color);
      }
      for (let k = 0; k < tier.rank; k++) {
        const y = top + k * 7 + 2;
        const side = k % 2 ? 1 : -1;
        const x = BX + side * (4 + hash(k, 1, f.seed) * 4);
        c.set(x, y, '#ffffff');
        c.set(x - 1, y, tier.color);
        c.set(x + 1, y, tier.color);
        c.set(x, y - 1, tier.color);
        c.set(x, y + 1, tier.color);
      }
      break;
    }
    case 'fade':
      if (hash(2, Math.floor(f.t * 6), f.seed) > f.t) paintChest(c, m, FEET, 1, false, 0);
      for (let k = 0; k < tier.rank * 2; k++) {
        if (hash(k, 5, f.seed) < f.t) continue;
        c.set(BX - 8 + hash(k, 2, f.seed) * 16, FEET - 20 - hash(k, 3, f.seed) * 30 - f.t * 8, tier.color);
      }
      break;
  }
  c.flush(sink, m.outline);
}

export const cofreTier: EffectDef = {
  id: 'cofre-tier',
  lore: 'El cofre brilla con su metal y su botín se revela en una columna del color de su densidad (LORE §2).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { chest: { x: BX, y: FEET - 3 } },
  layer: 'front',
  priority: 2,
  phases: [
    { name: 'drop', ms: 400 },
    { name: 'glow', ms: 500 },
    { name: 'open', ms: 500 },
    { name: 'fade', ms: 400 },
  ],
  reducedPhases: [
    { name: 'drop', ms: 0 },
    { name: 'glow', ms: 0 },
    { name: 'open', ms: 1000 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'fade' ? 1 - f.t : 1;
  },
};
