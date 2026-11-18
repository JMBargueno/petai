import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';

/**
 * Sello de logro (LORE §7: el «pergamino» con que el Éter deja constancia de lo hecho).
 *
 * Sobre la cabeza se desenrolla un pergamino, un sello del Flujo cae y estampa su runa, y el marco
 * del pergamino crece con el rango (`params.tier`): común liso, raro con ribete, épico con ribete y
 * gemas en las esquinas, legendario además con corona y destellos. Luego se enrolla y sube.
 *
 * El papel es papel (rampa fija); el sello y los adornos, del Flujo del Pockai.
 * Rejilla 64×80 ×2; pies en la fila 76; el pergamino ocupa las filas 4-20.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const TOP = 6;
const ROWS = 11;
const HALF_MAX = 22;
const PAPER = { outline: '#3b2a14', deep: '#8a6a35', mid: '#d9bf7f', light: '#f6e7bd' };
const TIER_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 3 };

export function tierRank(tier: unknown): number {
  return TIER_RANK[String(tier ?? '')] ?? 0;
}

function paintScroll(c: Canvas2, f: FxFrame, half: number, dy: number, rank: number, lit: boolean) {
  const { palette } = f;
  const h = Math.max(0, Math.round(half));
  // Papel con fibras
  for (let y = 0; y < ROWS; y++) {
    for (let x = CX - h; x < CX + h; x++) {
      const fiber = (x * 7 + y * 3) % 11 === 0;
      let col = y === 0 ? PAPER.light : y === ROWS - 1 ? PAPER.deep : fiber ? PAPER.mid : PAPER.light;
      // Ribete (raro y más)
      if (rank >= 1 && (y === 1 || y === ROWS - 2) && x > CX - h + 1 && x < CX + h - 2) col = lit ? palette.light : palette.mid;
      c.set(x, TOP + y + dy, col);
    }
  }
  // Rodillos en los extremos
  for (const side of [-1, 1]) {
    const x = side < 0 ? CX - h - 2 : CX + h;
    for (let y = -1; y <= ROWS; y++) {
      c.set(x, TOP + y + dy, PAPER.deep);
      c.set(x + 1, TOP + y + dy, y === -1 || y === ROWS ? palette.mid : PAPER.mid);
    }
    // Gemas en las esquinas (épico)
    if (rank >= 2 && h > 8) {
      c.set(x + (side < 0 ? 0 : 1), TOP - 2 + dy, palette.glow);
      c.set(x + (side < 0 ? 0 : 1), TOP + ROWS + 1 + dy, palette.glow);
    }
  }
  // Líneas de escritura
  if (h > 6) {
    for (const y of [3, 5, 7]) {
      for (let x = CX - h + 3; x < CX + h - 3; x++) if ((x + y) % 5 !== 0 && Math.abs(x - CX) > 4) c.set(x, TOP + y + dy, PAPER.deep);
    }
  }
}

/** Sello: disco del Flujo con una runa; `drop` 0..1 lo baja desde arriba. */
function paintSeal(c: Canvas2, f: FxFrame, cy: number, glowing: boolean) {
  const { palette } = f;
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      if (x * x + y * y > 11) continue;
      const rune = (x === 0 && Math.abs(y) <= 2) || (y === 0 && Math.abs(x) <= 1);
      c.set(CX - 0.5 + x, cy + y, rune ? (glowing ? palette.glow : palette.light) : x + y < -2 ? palette.light : palette.mid);
    }
  }
}

function paintCrown(c: Canvas2, f: FxFrame, dy: number) {
  const { palette } = f;
  const pts = [-6, -3, 0, 3, 6];
  pts.forEach((dx, i) => {
    const tall = i === 2 ? 3 : i % 2 ? 1 : 2;
    for (let k = 0; k <= tall; k++) c.set(CX - 0.5 + dx, TOP - 2 - k + dy, k === tall ? palette.glow : palette.light);
  });
  for (let x = -7; x <= 7; x++) c.set(CX - 0.5 + x, TOP - 2 + dy, palette.mid);
}

function paintSparkles(c: Canvas2, f: FxFrame) {
  for (let k = 0; k < 6; k++) {
    if (Math.floor(f.time / 120 + k) % 3) continue;
    const x = CX - 26 + hash(k, 1, f.seed) * 52;
    const y = TOP - 3 + hash(k, 2, f.seed) * (ROWS + 6);
    c.set(x, y, f.palette.glow);
    c.set(x - 1, y, f.palette.light);
    c.set(x + 1, y, f.palette.light);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const rank = tierRank(f.params['tier']);
  const sealY = TOP + Math.floor(ROWS / 2);

  if (f.reduced) {
    paintScroll(c, f, HALF_MAX, 0, rank, true);
    paintSeal(c, f, sealY, true);
    if (rank >= 3) paintCrown(c, f, 0);
    c.flush(sink, PAPER.outline);
    return;
  }

  switch (f.phase) {
    case 'unroll':
      paintScroll(c, f, 2 + easeOut(f.t) * (HALF_MAX - 2), 0, rank, false);
      break;
    case 'stamp': {
      paintScroll(c, f, HALF_MAX, 0, rank, f.t > 0.55);
      const cy = -6 + easeIn(span(f.t, 0, 0.5)) * (sealY + 6);
      paintSeal(c, f, cy, f.t > 0.5);
      // Impacto del sello: anillo que se abre
      if (f.t > 0.5 && f.t < 0.9) {
        const r = 4 + span(f.t, 0.5, 0.9) * 8;
        for (let a = 0; a < Math.PI * 2; a += 0.15) c.set(CX - 0.5 + Math.cos(a) * r, sealY + Math.sin(a) * r * 0.6, f.palette.glow);
      }
      break;
    }
    case 'show':
      paintScroll(c, f, HALF_MAX, 0, rank, Math.floor(f.time / 250) % 2 === 0);
      paintSeal(c, f, sealY, true);
      if (rank >= 3) {
        paintCrown(c, f, 0);
        paintSparkles(c, f);
      }
      break;
    case 'rise': {
      const dy = -Math.round(easeIn(f.t) * 14);
      const half = HALF_MAX * (1 - easeIn(f.t) * 0.85);
      paintScroll(c, f, half, dy, rank, false);
      if (f.t < 0.5) paintSeal(c, f, sealY + dy, false);
      break;
    }
  }
  c.flush(sink, PAPER.outline);
}

export const selloLogro: EffectDef = {
  id: 'sello-logro',
  lore: 'El Éter deja constancia del logro en un pergamino sellado, más rico cuanto más alto el rango (LORE §7).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { seal: { x: CX, y: TOP + 5 } },
  layer: 'front',
  priority: 2,
  phases: [
    { name: 'unroll', ms: 420 },
    { name: 'stamp', ms: 480 },
    { name: 'show', ms: 900 },
    { name: 'rise', ms: 420 },
  ],
  reducedPhases: [
    { name: 'unroll', ms: 200 },
    { name: 'stamp', ms: 0 },
    { name: 'show', ms: 1200 },
    { name: 'rise', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'unroll') return f.t;
    if (f.phase === 'rise') return 1 - f.t;
    return 1;
  },
};
