import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';

/**
 * Descarga cálida: la bienvenida tras una ausencia (LORE §6: el reencuentro es «una descarga de
 * luz cálida que rompe el frío»).
 *
 * La escarcha del tiempo a solas trepa por el suelo y alrededor de la mascota en agujas de hielo;
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

/** Agujas de escarcha: semillas fijas que crecen hacia la mascota. */
type Needle = { x: number; y: number; dx: number; dy: number; len: number };

function needles(f: FxFrame): Needle[] {
  const amount = FROST_BY_TIER[String(f.params['tier'] ?? '')] ?? 0.5;
  const n = Math.round(10 + amount * 18);
  const out: Needle[] = [];
  for (let k = 0; k < n; k++) {
    const a = hash(k, 1, f.seed) * Math.PI * 2;
    const r = 22 + hash(k, 2, f.seed) * 8;
    const x = HEART.x + Math.cos(a) * r;
    const y = Math.min(FEET, HEART.y + Math.sin(a) * r * 1.1);
    const len = 3 + Math.round(hash(k, 3, f.seed) * 5 * (0.6 + amount));
    const inA = a + Math.PI + (hash(k, 4, f.seed) - 0.5) * 0.8;
    out.push({ x, y, dx: Math.cos(inA), dy: Math.sin(inA), len });
  }
  // Escarcha a ras de suelo
  const ground = Math.round(8 + amount * 10);
  for (let k = 0; k < ground; k++) {
    const x = CX - 28 + hash(k, 5, f.seed) * 56;
    out.push({ x, y: FEET, dx: 0, dy: -1, len: 2 + Math.round(hash(k, 6, f.seed) * 4 * (0.5 + amount)) });
  }
  return out;
}

function paintFrost(c: Canvas2, f: FxFrame, grow: number, meltR: number, t: number) {
  const palette = ICE;
  for (const [i, nd] of needles(f).entries()) {
    const len = Math.round(nd.len * grow);
    for (let s = 0; s <= len; s++) {
      const x = nd.x + nd.dx * s;
      const y = nd.y + nd.dy * s;
      const r = Math.hypot(x - HEART.x, (y - HEART.y) / 1.1);
      if (r < meltR) {
        // Derretida: una gota que cae desde donde estaba la punta
        if (s === len && hash(i, 8, f.seed) < 0.7) {
          const fall = easeIn(span(t, hash(i, 9, f.seed) * 0.4, 1)) * 14;
          if (y + fall < FEET) c.set(x, y + fall, palette.light);
        }
        continue;
      }
      const tip = s === len;
      c.set(x, y, tip ? palette.glow : s % 2 ? palette.light : palette.mid);
      // Rama lateral en las agujas largas
      if (s === 2 && len > 4) c.set(x + nd.dy, y - nd.dx, palette.light);
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
  // El hielo lleva su propio contorno: se pinta aparte y se funde debajo de la onda
  const ice = new Canvas2(W, H);

  if (f.reduced) {
    paintWave(c, f, 24, 1);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'frost':
      paintFrost(ice, f, easeOut(f.t), 0, 0);
      break;
    case 'warm': {
      const r = easeOut(f.t) * 34;
      paintFrost(ice, f, 1, r, f.t);
      paintWave(c, f, r, 1);
      // Núcleo de luz en el pecho al soltar la descarga
      if (f.t < 0.3) for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) c.set(HEART.x + dx, HEART.y + dy, f.palette.glow);
      break;
    }
    case 'drip': {
      paintFrost(ice, f, 1, 99, 0.6 + f.t * 0.4);
      paintWave(c, f, 34 + f.t * 6, 1 - f.t * 1.3);
      break;
    }
  }
  ice.flush(sink, ICE.outline);
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
