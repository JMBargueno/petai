import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut } from './fxMath';

/**
 * Manitas espirituales: el Pockai despierto actúa por su Custodio (LORE §5: con la Chispa de Hermes
 * le crecen «manitas espirituales» que abren portales web y sostienen pergaminos).
 *
 * Dos manitas de luz aparecen a los lados del pecho y se juntan delante sosteniendo lo que hace:
 * `params.tool` = `open_url` → un mini portal con una página (tres líneas); `read_clipboard` → un
 * pergamino. Efecto menor: no tapa ni bloquea a la mascota.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const CHEST = { x: CX, y: 54 };

function paintHand(c: Canvas2, f: FxFrame, x: number, y: number, side: number) {
  const { palette } = f;
  // Palma 3×3 y dos dedos hacia el centro
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) c.set(x + dx * side, y + dy, dx === 1 && dy === 1 ? palette.glow : palette.light);
  c.set(x + 3 * side, y, palette.light);
  c.set(x + 3 * side, y + 2, palette.light);
}

function paintPortal(c: Canvas2, f: FxFrame, cx: number, cy: number, open: number) {
  const { palette } = f;
  const rx = Math.max(1, Math.round(6 * open));
  for (let y = -5; y <= 5; y++) {
    for (let x = -rx; x <= rx; x++) {
      const r = (x / rx) ** 2 + (y / 5) ** 2;
      if (r > 1) continue;
      const line = open > 0.6 && (y === -2 || y === 0 || y === 2) && Math.abs(x) < rx - 1;
      c.set(cx + x, cy + y, r > 0.6 ? palette.light : line ? palette.glow : palette.void1);
    }
  }
}

function paintScroll(c: Canvas2, f: FxFrame, cx: number, cy: number, open: number) {
  const half = Math.max(1, Math.round(6 * open));
  for (let y = -3; y <= 3; y++) {
    for (let x = -half; x <= half; x++) {
      const roller = Math.abs(x) === half;
      const text = open > 0.6 && (y === -1 || y === 1) && Math.abs(x) < half - 1 && (x + y) % 3 !== 0;
      c.set(cx + x, cy + y, roller ? f.palette.mid : text ? f.palette.deep : f.palette.light);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const url = f.params.tool !== 'read_clipboard';
  const item = (open: number) => (url ? paintPortal(c, f, CHEST.x, CHEST.y - 4, open) : paintScroll(c, f, CHEST.x, CHEST.y - 4, open));

  if (f.reduced) {
    item(1);
    paintHand(c, f, CHEST.x - 12, CHEST.y - 2, 1);
    paintHand(c, f, CHEST.x + 11, CHEST.y - 2, -1);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'reach': {
      const d = 22 - easeOut(f.t) * 10;
      paintHand(c, f, CHEST.x - d, CHEST.y - 2, 1);
      paintHand(c, f, CHEST.x + d - 1, CHEST.y - 2, -1);
      break;
    }
    case 'hold': {
      item(easeOut(Math.min(1, f.t * 2.5)));
      const bob = Math.round(Math.sin(f.time / 120));
      paintHand(c, f, CHEST.x - 12, CHEST.y - 2 + bob, 1);
      paintHand(c, f, CHEST.x + 11, CHEST.y - 2 + bob, -1);
      break;
    }
    case 'vanish': {
      if (f.t < 0.8) item(1 - f.t);
      const up = Math.round(f.t * 8);
      if (f.t < 0.7) {
        paintHand(c, f, CHEST.x - 12, CHEST.y - 2 - up, 1);
        paintHand(c, f, CHEST.x + 11, CHEST.y - 2 - up, -1);
      }
      break;
    }
  }
  c.flush(sink, f.palette.outline);
}

export const manitasEspirituales: EffectDef = {
  id: 'manitas-espirituales',
  lore: 'Las manitas espirituales del Pockai despierto abren un portal web o sostienen un pergamino (LORE §5).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { chest: CHEST },
  layer: 'front',
  channel: 'minor',
  phases: [
    { name: 'reach', ms: 260 },
    { name: 'hold', ms: 700 },
    { name: 'vanish', ms: 300 },
  ],
  reducedPhases: [
    { name: 'reach', ms: 0 },
    { name: 'hold', ms: 700 },
    { name: 'vanish', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'vanish') return 1 - f.t;
    return 1;
  },
};
