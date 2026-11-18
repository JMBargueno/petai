import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash, invert } from './fxMath';

/**
 * Destello del Prisma: el brillo periódico de un Pockai shiny (LORE §3: la Bendición del Prisma,
 * un Rayo Cósmico que «invierte y electrifica su paleta»).
 *
 * Cada 6 s, cuatro estrellitas en la paleta invertida chispean alrededor de la cabeza. Complementa
 * el brillo de la variante shiny que la hoja horneada pinta sobre el cuerpo (`fxFrame`): este va
 * fuera de la silueta. Efecto menor, muy corto.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;

/** Colores del Prisma (paleta invertida) a partir de la rampa del Flujo. */
export function prismColors(palette: { light: string; glow: string; mid: string }) {
  return { a: invert(palette.mid), b: invert(palette.light), core: palette.glow };
}

function star(c: Canvas2, x: number, y: number, size: number, a: string, b: string) {
  c.set(x, y, b);
  for (let i = 1; i <= size; i++) {
    c.set(x + i, y, a);
    c.set(x - i, y, a);
    c.set(x, y + i, a);
    c.set(x, y - i, a);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const p = prismColors(f.palette);
  const spots = [
    [CX - 16, 30],
    [CX + 15, 26],
    [CX + 18, 48],
    [CX - 19, 52],
  ];
  spots.forEach(([x, y], k) => {
    const local = f.reduced ? 0.5 : Math.max(0, Math.min(1, (f.t - k * 0.12) / 0.6));
    if (local <= 0 || local >= 1) return;
    const size = local < 0.5 ? Math.round(easeOut(local * 2) * 2) : Math.round((1 - local) * 4);
    star(c, x + Math.round(hash(k, 1, f.seed) * 2), y, Math.max(0, size), p.a, local < 0.5 ? p.core : p.b);
  });
  c.flush(sink, f.palette.outline);
}

export const destelloPrisma: EffectDef = {
  id: 'destello-prisma',
  lore: 'El Pockai shiny chispea con la Bendición del Prisma, en su paleta invertida (LORE §3).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: {},
  layer: 'front',
  channel: 'minor',
  phases: [{ name: 'glint', ms: 700 }],
  reducedPhases: [{ name: 'glint', ms: 400 }],
  fps: 12,
  draw,
  opacity(f) {
    return f.reduced ? 1 - f.t : 1;
  },
};
