import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash } from './fxMath';

/**
 * Destello de ritual: un ritual cumplido (spec 30: «brillo» de 1 s y mini confeti; LORE §9, la
 * Huella del Custodio que se marca con la constancia).
 *
 * Un anillo de luz del Flujo se abre alrededor de la mascota y suelta unas pocas motas. Efecto
 * menor: no bloquea ni tapa a la mascota.
 * Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const MID = { x: CX, y: 54 };

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const t = f.reduced ? 0.5 : f.phase === 'ring' ? f.t : 1;
  const fade = f.phase === 'fade' ? f.t : 0;
  const r = 14 + easeOut(t) * 12;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    if (hash(Math.round(a * 20), 1, f.seed) < fade) continue;
    const x = MID.x - 0.5 + Math.cos(a) * r;
    const y = MID.y + Math.sin(a) * r * 0.9;
    c.set(x, y, Math.sin(a) > 0 ? f.palette.light : f.palette.glow);
  }
  for (let k = 0; k < 8; k++) {
    if (hash(k, 3, f.seed) < fade) continue;
    const a = (k / 8) * Math.PI * 2 + 0.3;
    const d = r + 2 + easeOut(t) * 6;
    c.set(MID.x - 0.5 + Math.cos(a) * d, MID.y + Math.sin(a) * d * 0.9 - fade * 6, k % 2 ? f.palette.mid : f.palette.glow);
  }
  c.flush(sink, f.palette.outline);
}

export const destelloRitual: EffectDef = {
  id: 'destello-ritual',
  lore: 'La constancia de un ritual cumplido deja un anillo de luz en la Huella del Custodio (LORE §9).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { mid: MID },
  layer: 'behind',
  channel: 'minor',
  phases: [
    { name: 'ring', ms: 600 },
    { name: 'fade', ms: 400 },
  ],
  reducedPhases: [
    { name: 'ring', ms: 500 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'fade' ? 1 - f.t : 1;
  },
};
