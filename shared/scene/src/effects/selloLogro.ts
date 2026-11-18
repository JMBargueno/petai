import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, hash, span } from './fxMath';
import { frameOrigin, frameSize, paintSheetFrame, roleCenter, type FrameSheet } from './sheet';
import SCROLL_FRAMES from './frames/sello-logro.json';

/**
 * Sello de logro (LORE §7: el «pergamino» con que el Éter deja constancia de lo hecho).
 *
 * Sobre la cabeza se desenrolla un pergamino (dibujado con Nano Banana: lámina por roles), un lacre
 * del Flujo cae y estampa su runa, y el adorno crece con el rango (`params.tier`): común liso, raro
 * con ribete, épico además con gemas en los rodillos y legendario con una corona sobre la cabeza y
 * destellos. Luego se enrolla y sube.
 *
 * El papel es papel (rampa fija); el sello y los adornos, del Flujo del Pockai.
 * Rejilla 64×80 ×2; pies en la fila 76; el pergamino ocupa las filas 1-25.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const SHEET = SCROLL_FRAMES as FrameSheet;
const PAPER = { outline: '#3b2a14', deep: '#8a6a35', mid: '#d9bf7f', light: '#f6e7bd' };
const TIER_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 3 };

export function tierRank(tier: unknown): number {
  return TIER_RANK[String(tier ?? '')] ?? 0;
}

/**
 * Frames dibujados con Nano Banana (`frames/sello-logro.json`, por roles):
 * 0 enrollado · 1 a medio desenrollar · 2 abierto · 3 abierto y sellado · 4 el sello suelto.
 * El papel es papel (rampa fija); el lacre y su runa, del Flujo del Pockai.
 */
const ROLLED = 0;
const HALF = 1;
const OPEN = 2;
const SEALED = 3;
const SEAL = 4;
/** Base del pergamino abierto (25 filas: ocupa las filas 1-25, sobre la cabeza). */
const SCROLL_BOTTOM = 25;

function colorsFor(f: FxFrame, lit: boolean): Record<string, string> {
  const { palette } = f;
  return {
    outline: PAPER.outline,
    paperDeep: PAPER.deep,
    paperMid: PAPER.mid,
    paperLight: lit ? palette.light : PAPER.light,
    seal: palette.mid,
    sealLight: palette.light,
    rune: palette.glow,
  };
}

function paintScroll(c: Canvas2, f: FxFrame, frame: number, dy: number, lit: boolean) {
  paintSheetFrame(c, SHEET, frame, colorsFor(f, lit), { x: CX, bottom: SCROLL_BOTTOM + dy });
}

/** Dónde queda el lacre en el pergamino sellado (la IA no lo centra). */
const SEAL_AT = (() => {
  const o = frameOrigin(SHEET, SEALED, { x: CX, bottom: SCROLL_BOTTOM });
  const c = roleCenter(SHEET, SEALED, 'seal') ?? { x: frameSize(SHEET, SEALED).w / 2, y: frameSize(SHEET, SEALED).h / 2 };
  return { x: Math.round(o.x + c.x), y: Math.round(o.y + c.y) };
})();

/** El sello suelto, centrado en (x, y). */
function paintSeal(c: Canvas2, f: FxFrame, x: number, y: number) {
  const { h } = frameSize(SHEET, SEAL);
  paintSheetFrame(c, SHEET, SEAL, colorsFor(f, false), { x, bottom: Math.round(y + h / 2) - 1 });
}

/** Ribete (raro y más): una línea del Flujo justo dentro del borde de arriba y de abajo del papel. */
function paintTrim(c: Canvas2, f: FxFrame, lit: boolean) {
  const o = frameOrigin(SHEET, SEALED, { x: CX, bottom: SCROLL_BOTTOM });
  const rows = SHEET.frames[SEALED]!;
  const paper = new Set(['b', 'c', 'd']);
  const col = Math.round(frameSize(SHEET, SEALED).w * 0.3);
  let top = -1;
  let bottom = -1;
  rows.forEach((row, y) => {
    if (paper.has(row[col]!)) {
      if (top < 0) top = y;
      bottom = y;
    }
  });
  if (top < 0) return;
  for (const y of [top + 1, bottom - 1]) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) if (paper.has(row[x]!) && paper.has(row[x - 1] ?? '.') && paper.has(row[x + 1] ?? '.')) c.set(o.x + x, o.y + y, lit ? f.palette.light : f.palette.mid);
  }
}

/** Gemas (épico y más) en las puntas de los rodillos. */
function paintGems(c: Canvas2, f: FxFrame) {
  const o = frameOrigin(SHEET, SEALED, { x: CX, bottom: SCROLL_BOTTOM });
  const { w, h } = frameSize(SHEET, SEALED);
  for (const x of [o.x + 2, o.x + w - 3]) {
    c.set(x, o.y, f.palette.glow);
    c.set(x, o.y + h - 1, f.palette.glow);
  }
}

/** Corona (legendario): bajo el pergamino, sobre la cabeza del Pockai. */
function paintCrown(c: Canvas2, f: FxFrame, dy: number) {
  const { palette } = f;
  const base = SCROLL_BOTTOM + 3 + dy;
  const pts = [-6, -3, 0, 3, 6];
  pts.forEach((dx, i) => {
    const tall = i === 2 ? 3 : i % 2 ? 1 : 2;
    for (let k = 0; k <= tall; k++) c.set(CX - 0.5 + dx, base + 2 - k, k === tall ? palette.glow : palette.light);
  });
  for (let x = -7; x <= 7; x++) c.set(CX - 0.5 + x, base + 2, palette.mid);
}

function paintSparkles(c: Canvas2, f: FxFrame) {
  for (let k = 0; k < 6; k++) {
    if (Math.floor(f.time / 120 + k) % 3) continue;
    const x = CX - 26 + hash(k, 1, f.seed) * 52;
    const y = 1 + hash(k, 2, f.seed) * (SCROLL_BOTTOM + 4);
    c.set(x, y, f.palette.glow);
    c.set(x - 1, y, f.palette.light);
    c.set(x + 1, y, f.palette.light);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Dos capas: el pergamino trae su contorno; corona, destellos y anillo llevan el del motor
  const scroll = new Canvas2(W, H);
  const fx = new Canvas2(W, H);
  const rank = tierRank(f.params['tier']);
  const adorn = (lit: boolean) => {
    if (rank >= 1) paintTrim(scroll, f, lit);
    if (rank >= 2) paintGems(scroll, f);
    if (rank >= 3) paintCrown(fx, f, 0);
  };

  if (f.reduced) {
    paintScroll(scroll, f, SEALED, 0, false);
    adorn(true);
  } else {
    switch (f.phase) {
      case 'unroll':
        paintScroll(scroll, f, f.t < 0.3 ? ROLLED : f.t < 0.65 ? HALF : OPEN, 0, false);
        break;
      case 'stamp': {
        const landed = f.t > 0.5;
        paintScroll(scroll, f, landed ? SEALED : OPEN, 0, false);
        if (!landed) paintSeal(fx, f, SEAL_AT.x, -6 + easeIn(span(f.t, 0, 0.5)) * (SEAL_AT.y + 6));
        // Impacto del sello: anillo que se abre
        if (landed && f.t < 0.9) {
          const r = 5 + span(f.t, 0.5, 0.9) * 8;
          for (let a = 0; a < Math.PI * 2; a += 0.15) fx.set(SEAL_AT.x + Math.cos(a) * r, SEAL_AT.y + Math.sin(a) * r * 0.6, f.palette.glow);
        }
        break;
      }
      case 'show': {
        const lit = Math.floor(f.time / 250) % 2 === 0;
        paintScroll(scroll, f, SEALED, 0, false);
        adorn(lit);
        if (rank >= 3) paintSparkles(fx, f);
        break;
      }
      case 'rise': {
        // Se enrolla mientras sube y, ya enrollado, se esfuma
        const dy = -Math.round(easeIn(f.t) * 14);
        if (f.t < 0.9) paintScroll(scroll, f, f.t < 0.35 ? SEALED : f.t < 0.7 ? HALF : ROLLED, dy, false);
        break;
      }
    }
  }
  fx.flush(sink, PAPER.outline);
  scroll.flush(sink, null);
}

export const selloLogro: EffectDef = {
  id: 'sello-logro',
  lore: 'El Éter deja constancia del logro en un pergamino sellado, más rico cuanto más alto el rango (LORE §7).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { seal: SEAL_AT },
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
