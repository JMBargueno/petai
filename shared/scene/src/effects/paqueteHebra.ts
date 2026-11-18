import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, heart } from './fxMath';
import { frameOrigin, paintSheetFrame, type FrameSheet } from './sheet';
import ITEM_FRAMES from './frames/paquete-hebra.json';

/**
 * Paquete colgado de una hebra: un regalo o un paquete de cariño de otro Custodio (LORE §8: lo que
 * va de Santuario a Santuario viaja por las hebras del Nexo).
 *
 * Un paquete (o un sobre; ambos dibujados con Nano Banana, ver `paintItem`, `params.kind` = `care`) baja colgado de una hebra junto a la mascota, se
 * posa con un rebote, se abre en destellos (o en corazones) y la hebra se recoge.
 *
 * Rejilla 64×80 ×2; pies en la fila 76; el paquete cae a la derecha de la mascota (x≈54).
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
/** Centro del paquete (18 px de ancho: x 45..62). */
const PX = 54;
const PAPER = { light: '#fff0c8', mid: '#d8c088' };
const ITEM_SHEET = ITEM_FRAMES as FrameSheet;

/**
 * Frames dibujados con Nano Banana (`frames/paquete-hebra.json`, por roles):
 * 0 caja cerrada · 1 caja aplastada al posarse · 2 tapa levantada · 3 caja abierta ·
 * 4 sobre cerrado · 5 sobre abierto con un corazón.
 * La caja y su lazo toman el Flujo del Pockai; el sobre es papel y su corazón, del Flujo.
 */
const GIFT = { shut: 0, squash: 1, lid: 2, open: 3 };
const CARE = { shut: 4, squash: 4, lid: 5, open: 5 };
type Pose = keyof typeof GIFT;

/** Pinta el paquete (o el sobre) y devuelve la fila de su borde superior, donde se ata la hebra. */
function paintItem(c: Canvas2, f: FxFrame, care: boolean, pose: Pose, bottom: number): number {
  const { palette } = f;
  const frame = (care ? CARE : GIFT)[pose];
  const colors = care
    ? { outline: palette.outline, paperLight: PAPER.light, paperMid: PAPER.mid, accent: palette.mid, accentDeep: palette.deep, boxDeep: PAPER.mid, boxMid: PAPER.mid, boxLight: PAPER.light }
    : { outline: palette.outline, boxDeep: palette.deep, boxMid: palette.mid, boxLight: palette.light, accent: palette.glow, accentDeep: palette.light, paperLight: PAPER.light, paperMid: PAPER.mid };
  const pos = { x: PX, bottom: Math.round(bottom) };
  paintSheetFrame(c, ITEM_SHEET, frame, colors, pos);
  return frameOrigin(ITEM_SHEET, frame, pos).y;
}

function paintThread(c: Canvas2, f: FxFrame, toY: number) {
  for (let y = 0; y < toY; y++) c.set(PX - 1 + ((y >> 2) % 2), y, y % 3 === 0 ? f.palette.light : f.palette.mid);
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Dos capas: el paquete trae su contorno de la lámina; hebra y destellos llevan el del motor
  const fx = new Canvas2(W, H);
  const item = new Canvas2(W, H);
  const care = f.params['kind'] === 'care';

  if (f.reduced) {
    paintItem(item, f, care, 'shut', FEET);
  } else {
    switch (f.phase) {
      case 'drop': {
        const bottom = 22 + easeIn(f.t) * (FEET - 22);
        paintThread(fx, f, paintItem(item, f, care, 'shut', bottom));
        break;
      }
      case 'land': {
        const pose: Pose = f.t > 0.15 && f.t < 0.7 ? 'squash' : 'shut';
        paintThread(fx, f, paintItem(item, f, care, pose, FEET));
        break;
      }
      case 'open': {
        paintItem(item, f, care, f.t < 0.3 ? 'lid' : 'open', FEET);
        // Lo que trae: destellos o corazones que suben
        for (let k = 0; k < 6; k++) {
          const local = Math.max(0, f.t - k * 0.08);
          if (local <= 0) continue;
          const x = PX - 8 + hash(k, 1, f.seed) * 16;
          const y = FEET - 18 - easeOut(local) * 28;
          if (care) heart(fx, x - 2, y, f.palette.mid, f.palette.glow);
          else {
            fx.set(x, y, f.palette.glow);
            fx.set(x - 1, y, f.palette.light);
            fx.set(x + 1, y, f.palette.light);
            fx.set(x, y - 1, f.palette.light);
            fx.set(x, y + 1, f.palette.light);
          }
        }
        break;
      }
      case 'retract': {
        // El paquete abierto se desvanece y la hebra sube
        if (hash(1, Math.floor(f.t * 6), f.seed) > f.t) paintItem(item, f, care, 'open', FEET);
        paintThread(fx, f, (FEET - 18) * (1 - easeIn(f.t)));
        break;
      }
    }
  }
  fx.flush(sink, f.palette.outline);
  item.flush(sink, null);
}

export const paqueteHebra: EffectDef = {
  id: 'paquete-hebra',
  lore: 'El regalo de otro Custodio llega colgado de una hebra del Nexo y se abre junto al Pockai (LORE §8).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { item: { x: PX, y: FEET - 4 } },
  layer: 'front',
  priority: 2,
  phases: [
    { name: 'drop', ms: 600 },
    { name: 'land', ms: 240 },
    { name: 'open', ms: 620 },
    { name: 'retract', ms: 380 },
  ],
  reducedPhases: [
    { name: 'drop', ms: 0 },
    { name: 'land', ms: 0 },
    { name: 'open', ms: 1200 },
    { name: 'retract', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'retract') return 1 - f.t;
    return 1;
  },
};
