import type { EffectDef, FxFrame, FxPhase, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, invert, span } from './fxMath';

/**
 * Revelación de densidad: el nacimiento de un Pockai (LORE §2 y §3).
 *
 * Una columna de luz sale del suelo y la rodean tantos anillos como densidad tiene el linaje:
 * 1 Eco Cotidiano (normal) … 5 Singularidad Primordial (mítico), que además late dos veces (el
 * «Primer Latido»). Dos fases son opcionales y salen de `params`:
 *  - `pity`: antes, las hebras de la **Promesa del Telar** vibran y se tensan (la garantía cumplida).
 *  - `shiny` = 1: al final cae el **Rayo Cósmico** en diagonal y la columna estalla en prisma, con la
 *    paleta invertida (la Bendición del Prisma: «invierte y electrifica su paleta»).
 *
 * Params: `rarity` (normal | rare | super_rare | legendary | mythic), `shiny` (0/1), `pity`.
 * Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS de la mascota (o a su lado, si la que nace es otra).
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const TOP = 6;
const TIERS: Record<string, number> = { normal: 1, common: 1, rare: 2, super_rare: 3, 'super-rare': 3, legendary: 4, mythic: 5 };

export function densityTier(rarity: unknown): number {
  return TIERS[String(rarity ?? '')] ?? 1;
}

function paintColumn(c: Canvas2, f: FxFrame, top: number, half: number, flash: boolean) {
  const { palette } = f;
  for (let y = Math.max(0, Math.floor(top)); y <= FEET; y++) {
    for (let dx = -half; dx < half; dx++) {
      const edge = dx === -half || dx === half - 1;
      const core = Math.abs(dx + 0.5) < half * 0.35;
      // Bandas que suben por la columna
      const band = Math.floor((y + (f.reduced ? 0 : f.time) / 40) / 3) % 3 === 0;
      let col = edge ? palette.mid : core ? palette.glow : band ? palette.light : palette.mid;
      if (flash && !edge) col = palette.glow;
      c.set(CX + dx, y, col);
    }
  }
  // Remate redondeado arriba
  if (top > 0) c.set(CX - 1, Math.floor(top) - 1, palette.light);
}

function ringY(i: number, tier: number): number {
  return FEET - 8 - (i * (FEET - TOP - 22)) / Math.max(1, tier - 1 || 1);
}

function paintRing(c: Canvas2, f: FxFrame, y: number, rx: number, k: number) {
  const { palette } = f;
  for (let a = 0; a < Math.PI * 2; a += 0.06) {
    const front = Math.sin(a) > 0;
    c.set(CX - 0.5 + Math.cos(a) * rx, y + Math.sin(a) * rx * 0.22, front ? (k % 2 ? palette.glow : palette.light) : palette.deep);
  }
}

/** Hebras de la Promesa: cinco hilos verticales que vibran y al final se tensan y brillan. */
function paintPromise(c: Canvas2, f: FxFrame, t: number) {
  const { palette } = f;
  const tense = span(t, 0.6, 1);
  for (let k = 0; k < 5; k++) {
    const x0 = CX - 20 + k * 10;
    const amp = (1 - tense) * (1 + span(t, 0, 0.6) * 3);
    const reach = easeOut(span(t, 0, 0.35)) * (FEET - 2);
    for (let y = 0; y <= reach; y++) {
      const wob = Math.sin(y * 0.5 + f.time / 45 + k * 1.7) * amp;
      const lit = tense > 0 && (y + k * 3) % 6 < 2;
      c.set(x0 + wob, y, lit ? palette.glow : tense > 0.5 ? palette.light : palette.mid);
    }
  }
}

function paintRay(c: Canvas2, f: FxFrame, t: number) {
  const inv = { mid: invert(f.palette.mid), light: invert(f.palette.light), glow: invert(f.palette.glow) };
  // Rayo diagonal desde la esquina superior izquierda hasta el centro de la columna
  const hitX = CX;
  const hitY = 40;
  const head = easeIn(span(t, 0, 0.4));
  const steps = 60;
  for (let i = 0; i <= steps * head; i++) {
    const p = i / steps;
    const x = p * hitX;
    const y = p * hitY;
    const tail = head - p < 0.12;
    c.set(x, y, tail ? f.palette.glow : inv.light);
    if (i % 2 === 0) c.set(x + 1, y, inv.mid);
  }
  // Estallido en prisma: rayos de la paleta invertida en estrella
  const burst = span(t, 0.4, 1);
  if (burst > 0) {
    for (let k = 0; k < 12; k++) {
      if (hash(k, 7, f.seed) < span(burst, 0.5, 1)) continue;
      const a = (k / 12) * Math.PI * 2;
      const d = 3 + easeOut(burst) * 20;
      const col = [inv.glow, inv.light, inv.mid][k % 3];
      const x = hitX - 0.5 + Math.cos(a) * d;
      const y = hitY + Math.sin(a) * d * 0.9;
      // Destello en cruz con el centro del color invertido: el prisma se lee a 64 px
      c.set(x, y, f.palette.glow);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + ox, y + oy, col);
      if (k % 2 === 0) for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) c.set(x + ox, y + oy, inv.mid);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const tier = densityTier(f.params.rarity);
  const shiny = Number(f.params.shiny) === 1;

  if (f.reduced) {
    paintColumn(c, f, TOP, 4, false);
    for (let i = 0; i < tier; i++) paintRing(c, f, ringY(i, tier), 9 + i, i);
    if (shiny) paintRay(c, f, 0.6);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'promise':
      paintPromise(c, f, f.t);
      break;
    case 'rise': {
      const top = FEET - easeOut(f.t) * (FEET - TOP);
      paintColumn(c, f, top, 2 + Math.round(f.t * 2), false);
      break;
    }
    case 'density': {
      // Primer Latido (mítico): dos destellos de toda la columna
      const beat = tier >= 5 && ((f.t > 0.62 && f.t < 0.7) || (f.t > 0.8 && f.t < 0.88));
      paintColumn(c, f, TOP, beat ? 5 : 4, beat);
      for (let i = 0; i < tier; i++) {
        const local = span(f.t, (i / tier) * 0.6, (i / tier) * 0.6 + 0.25);
        if (local <= 0) continue;
        paintRing(c, f, ringY(i, tier), 4 + easeOut(local) * (5 + i), i);
      }
      if (beat) for (let a = 0; a < Math.PI * 2; a += 0.05) c.set(CX - 0.5 + Math.cos(a) * 26, FEET - 1 + Math.sin(a) * 4, f.palette.light);
      break;
    }
    case 'prism':
      paintColumn(c, f, TOP, 4, f.t > 0.38 && f.t < 0.5);
      for (let i = 0; i < tier; i++) paintRing(c, f, ringY(i, tier), 9 + i, i);
      if (shiny) paintRay(c, f, f.t);
      break;
    case 'fade': {
      // La columna se estrecha a un hilo y se recoge hacia el suelo; quedan motas
      const half = Math.max(0, Math.round(4 * (1 - f.t * 1.4)));
      if (half > 0) paintColumn(c, f, TOP + easeIn(f.t) * (FEET - TOP), half, false);
      for (let k = 0; k < 10; k++) {
        if (hash(k, 3, f.seed) < f.t) continue;
        c.set(CX - 14 + hash(k, 1, f.seed) * 28, FEET - 10 - hash(k, 2, f.seed) * 50 - f.t * 10, f.palette.light);
      }
      break;
    }
  }
  c.flush(sink, f.palette.outline);
}

const PHASES: FxPhase[] = [
  { name: 'promise', ms: 600 },
  { name: 'rise', ms: 450 },
  { name: 'density', ms: 650 },
  { name: 'prism', ms: 450 },
  { name: 'fade', ms: 350 },
];
const REDUCED: FxPhase[] = [
  { name: 'promise', ms: 0 },
  { name: 'rise', ms: 200 },
  { name: 'density', ms: 1000 },
  { name: 'prism', ms: 0 },
  { name: 'fade', ms: 200 },
];

/** Sin garantía no hay Promesa; sin shiny no hay Rayo (la fase de prisma se queda corta). */
function phasesFor(params: Record<string, string | number>, reduced: boolean): FxPhase[] {
  const base = reduced ? REDUCED : PHASES;
  return base.map((p) => {
    if (p.name === 'promise' && !params.pity) return { ...p, ms: 0 };
    if (p.name === 'prism' && Number(params.shiny) !== 1) return { ...p, ms: reduced ? 0 : 150 };
    return p;
  });
}

export const revelacionDensidad: EffectDef = {
  id: 'revelacion-densidad',
  lore: 'La densidad del linaje se revela en anillos alrededor de una columna de luz; la Promesa del Telar y el Rayo Cósmico, si los hay (LORE §2, §3).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { hit: { x: CX, y: 40 } },
  layer: 'behind',
  priority: 3,
  phases: [
    { name: 'promise', ms: 600 },
    { name: 'rise', ms: 450 },
    { name: 'density', ms: 650 },
    { name: 'prism', ms: 450 },
    { name: 'fade', ms: 350 },
  ],
  reducedPhases: [
    { name: 'promise', ms: 0 },
    { name: 'rise', ms: 200 },
    { name: 'density', ms: 1000 },
    { name: 'prism', ms: 0 },
    { name: 'fade', ms: 200 },
  ],
  phasesFor,
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'rise') return f.t;
    if (f.phase === 'fade') return 1 - f.t;
    return 1;
  },
};
