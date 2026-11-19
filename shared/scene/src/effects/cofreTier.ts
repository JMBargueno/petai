import type { EffectDef, FxFrame, PixelSink } from './types';
import { paintSheetFrame, type FrameSheet } from './sheet';
import CHEST_FRAMES from './frames/cofre-tier.json';

const CHEST = CHEST_FRAMES as FrameSheet;
import { Canvas2, easeIn, easeOut, hash } from './fxMath';

/**
 * Cofre por tier: se abre un cofre (spec 02: brillo por tier y revelación; LORE §2, la densidad).
 *
 * El cofre está dibujado con Nano Banana (lámina importada por roles, ver `paintChest`). Cae junto a la mascota, brilla con el color de su tipo (`params.type`: bronce, plata,
 * oro, diamante o mítico) y tiembla; la tapa salta y sube una columna de luz del color del mejor
 * drop (`params.bestTier`) con tantos destellos como su rango.
 *
 * Los metales y los tiers tienen rampas fijas: son el cofre y su botín, no el Pockai.
 * Rejilla 64×80 ×2; pies en la fila 76; el cofre (26 px) cae pegado al borde derecho. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
/** Centro de la boca del cofre (de ahí sale la columna) y su altura. */
const BX = 49;
const MOUTH_Y = FEET - 14;

type Ramp = { outline: string; deep: string; mid: string; light: string };
export const METAL: Record<string, Ramp> = {
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

/**
 * Frames del cofre dibujados con Nano Banana e importados POR ROLES (`scripts/sprites/effects/
 * import.mjs`): cada letra es un rol de `CHEST.roles` (a = outline, b = woodDeep…), así el metal
 * se tiñe con la rampa del tipo y la luz interior con el color del mejor drop.
 * 0 cerrado · 1 cerradura brillando · 2 tapa entreabierta · 3 abierto con luz · 4 abierto vacío.
 */
const SHUT = 0;
const SHINE = 1;
const AJAR = 2;
const OPEN_LIT = 3;
const OPEN = 4;
/** Borde izquierdo del cofre (pegado al borde derecho de la rejilla, junto a la mascota). */
const CHEST_X = 36;

function paintChest(c: Canvas2, m: Ramp, frame: number, bottom: number, shake: number, light: string) {
  paintSheetFrame(
    c,
    CHEST,
    frame,
    { outline: m.outline, woodDeep: WOOD.deep, woodMid: WOOD.mid, metalDeep: m.deep, metalMid: m.mid, metalLight: m.light, glow: light },
    { x: CHEST_X + shake, bottom, align: 'left' },
  );
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Dos capas: la luz y los destellos llevan contorno; el cofre ya trae el suyo de la lámina
  const fx = new Canvas2(W, H);
  const chest = new Canvas2(W, H);
  const m = METAL[String(f.params['type'] ?? 'bronze')] ?? METAL['bronze']!;
  const tier = TIER[String(f.params['bestTier'] ?? 'common')] ?? TIER['common']!;

  if (f.reduced) {
    paintChest(chest, m, OPEN_LIT, FEET, 0, tier.color);
  } else {
    switch (f.phase) {
      case 'drop':
        paintChest(chest, m, SHUT, Math.round(24 + easeIn(f.t) * (FEET - 24)), 0, '#ffffff');
        break;
      case 'glow': {
        // La cerradura destella con el metal del tipo y el cofre tiembla
        const pulse = Math.floor(f.time / 125) % 2 === 0;
        paintChest(chest, pulse ? { ...m, mid: m.light } : m, pulse ? SHINE : SHUT, FEET, f.t > 0.4 ? (pulse ? 1 : -1) : 0, '#ffffff');
        break;
      }
      case 'open': {
        paintChest(chest, m, f.t < 0.25 ? AJAR : OPEN_LIT, FEET, 0, tier.color);
        // Columna del color del mejor drop, con un destello por rango
        const top = MOUTH_Y - easeOut(f.t) * 46;
        for (let y = Math.round(top); y < MOUTH_Y; y++) {
          for (let x = BX - 3; x <= BX + 2; x++) fx.set(x, y, Math.abs(x + 0.5 - BX) < 1.5 ? '#ffffff' : tier.color);
        }
        for (let k = 0; k < tier.rank; k++) {
          const y = top + k * 7 + 2;
          const side = k % 2 ? 1 : -1;
          const x = BX + side * (6 + hash(k, 1, f.seed) * 4);
          fx.set(x, y, '#ffffff');
          fx.set(x - 1, y, tier.color);
          fx.set(x + 1, y, tier.color);
          fx.set(x, y - 1, tier.color);
          fx.set(x, y + 1, tier.color);
        }
        break;
      }
      case 'fade':
        if (hash(2, Math.floor(f.t * 6), f.seed) > f.t) paintChest(chest, m, OPEN, FEET, 0, tier.color);
        for (let k = 0; k < tier.rank * 2; k++) {
          if (hash(k, 5, f.seed) < f.t) continue;
          fx.set(BX - 10 + hash(k, 2, f.seed) * 20, MOUTH_Y - 6 - hash(k, 3, f.seed) * 30 - f.t * 8, tier.color);
        }
        break;
    }
  }
  fx.flush(sink, m.outline);
  chest.flush(sink, null);
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
