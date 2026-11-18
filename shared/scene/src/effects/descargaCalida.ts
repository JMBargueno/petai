import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { paintSheetFrame, type FrameSheet } from './sheet';
import FROST_FRAMES from './frames/descarga-calida.json';

/**
 * Descarga cálida: la bienvenida tras una ausencia (LORE §6: el reencuentro es «una descarga de
 * luz cálida que rompe el frío»).
 *
 * La escarcha del tiempo a solas (dibujada con Nano Banana) trepa desde el suelo alrededor de la
 * mascota en agujas de hielo;
 * luego una onda de luz sale de su pecho, derrite la escarcha a su paso en gotas que caen y deja un
 * halo. Cuanto más dura fue la ausencia (`params.tier`), más escarcha: `happy` < `emotional` < `sad`
 * < `offended`.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS de la mascota.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const HEART = { x: CX, y: 52 };
/** La escarcha es frío de verdad, igual en todos los Flujos; lo cálido es la luz del Pockai. */
const ICE = { outline: '#1d3a52', mid: '#8fbfdf', light: '#d4ecfa', glow: '#ffffff' };
const FROST_BY_TIER: Record<string, number> = { happy: 0.35, emotional: 0.55, sad: 0.8, offended: 1 };

/**
 * Corona de escarcha dibujada con Nano Banana (`frames/descarga-calida.json`, por roles): agujas de
 * hielo que crecen hacia dentro, más densas en el suelo. Trepa desde el suelo hasta una altura que
 * depende de lo larga que fue la ausencia; la onda la derrite por radio y deja gotas que caen.
 */
const SHEET = FROST_FRAMES as FrameSheet;
const FROST_H = SHEET.frames[0]!.length;

function paintFrost(ice: Canvas2, drops: Canvas2, f: FxFrame, grow: number, meltR: number, t: number) {
  const amount = FROST_BY_TIER[String(f.params['tier'] ?? '')] ?? 0.5;
  const tmp = new Canvas2(W, H);
  paintSheetFrame(tmp, SHEET, 0, { outline: ICE.outline, mid: ICE.mid, light: ICE.light, glow: ICE.glow }, { x: CX, bottom: FEET });
  // Hasta dónde ha trepado (desde el suelo)
  const top = FEET - grow * (0.25 + amount * 0.75) * FROST_H;
  for (let y = Math.max(0, Math.floor(top)); y <= FEET; y++) {
    for (let x = 0; x < W; x++) {
      const col = tmp.get(x, y);
      if (!col) continue;
      const r = Math.hypot(x - HEART.x, (y - HEART.y) / 1.1);
      if (r >= meltR) {
        ice.set(x, y, col);
        continue;
      }
      // Derretida: algunas puntas sueltan una gota que cae
      if (hash(x, y, f.seed) < 0.05) {
        const fall = easeIn(span(t, hash(y, x, f.seed) * 0.4, 1)) * 14;
        if (y + fall < FEET) drops.set(x, y + fall, ICE.light);
      }
    }
  }
}

function paintWave(c: Canvas2, f: FxFrame, r: number, alpha: number) {
  const { palette } = f;
  if (alpha <= 0) return;
  for (let a = 0; a < Math.PI * 2; a += 0.04) {
    if (hash(Math.round(a * 30), 11, f.seed) > alpha) continue;
    const x = HEART.x - 0.5 + Math.cos(a) * r;
    const y = HEART.y + Math.sin(a) * r * 1.1;
    if (y > FEET) continue;
    c.set(x, y, palette.glow);
    c.set(x - Math.cos(a), y - Math.sin(a), palette.light);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  // El hielo trae su contorno de la lámina; las gotas llevan el del hielo; la onda, el del Flujo
  const ice = new Canvas2(W, H);
  const drops = new Canvas2(W, H);

  if (f.reduced) {
    paintWave(c, f, 24, 1);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'frost':
      paintFrost(ice, drops, f, easeOut(f.t), 0, 0);
      break;
    case 'warm': {
      const r = easeOut(f.t) * 34;
      paintFrost(ice, drops, f, 1, r, f.t);
      paintWave(c, f, r, 1);
      // Núcleo de luz en el pecho al soltar la descarga
      if (f.t < 0.3) for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) c.set(HEART.x + dx, HEART.y + dy, f.palette.glow);
      break;
    }
    case 'drip': {
      paintFrost(ice, drops, f, 1, 99, 0.6 + f.t * 0.4);
      paintWave(c, f, 34 + f.t * 6, 1 - f.t * 1.3);
      break;
    }
  }
  ice.flush(sink, null);
  drops.flush(sink, ICE.outline);
  c.flush(sink, f.palette.outline);
}

export const descargaCalida: EffectDef = {
  id: 'descarga-calida',
  lore: 'Al volver el Custodio, una descarga de luz cálida derrite la escarcha del tiempo a solas (LORE §6).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { heart: HEART },
  layer: 'behind',
  priority: 2,
  phases: [
    { name: 'frost', ms: 600 },
    { name: 'warm', ms: 700 },
    { name: 'drip', ms: 500 },
  ],
  reducedPhases: [
    { name: 'frost', ms: 0 },
    { name: 'warm', ms: 900 },
    { name: 'drip', ms: 250 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'drip') return 1 - f.t;
    return 1;
  },
};
