import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, heart } from './fxMath';

/**
 * Paquete colgado de una hebra: un regalo o un paquete de cariño de otro Custodio (LORE §8: lo que
 * va de Santuario a Santuario viaja por las hebras del Nexo).
 *
 * Un paquete (o un sobre, `params.kind` = `care`) baja colgado de una hebra junto a la mascota, se
 * posa con un rebote, se abre en destellos (o en corazones) y la hebra se recoge.
 *
 * Rejilla 64×80 ×2; pies en la fila 76; el paquete cae a la derecha de la mascota (x≈54).
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const PX = 54;
const PAPER = { light: '#fbf3dc', mid: '#e3cf9f' };

function paintGift(c: Canvas2, f: FxFrame, bottom: number, squash: number, lidUp: number) {
  const { palette } = f;
  const w = Math.round(10 * (1 + squash * 0.2));
  const h = Math.round(8 * (1 - squash * 0.25));
  const x0 = PX - Math.floor(w / 2);
  for (let y = bottom - h + 1; y <= bottom; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const ribbon = x === PX || x === PX - 1 || y === bottom - Math.floor(h / 2);
      c.set(x, y, ribbon ? palette.glow : x === x0 ? palette.light : palette.mid);
    }
  }
  // Tapa (se levanta al abrirse) y lazo
  const lidY = bottom - h - Math.round(lidUp * 6);
  for (let x = x0 - 1; x <= x0 + w; x++) c.set(x, lidY, palette.light);
  for (let x = x0 - 1; x <= x0 + w; x++) c.set(x, lidY - 1, palette.deep);
  c.set(PX - 2, lidY - 2, palette.glow);
  c.set(PX + 1, lidY - 2, palette.glow);
  c.set(PX - 1, lidY - 2, palette.light);
  c.set(PX, lidY - 2, palette.light);
}

function paintEnvelope(c: Canvas2, f: FxFrame, bottom: number, squash: number, open: number) {
  const w = 12;
  const h = Math.round(8 * (1 - squash * 0.25));
  const x0 = PX - w / 2;
  for (let y = bottom - h + 1; y <= bottom; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dy = y - (bottom - h + 1);
      const fold = Math.abs(x + 0.5 - PX) === Math.round((h - dy) * 0.75) && open < 0.5;
      c.set(x, y, fold ? PAPER.mid : PAPER.light);
    }
  }
  heart(c, PX - 3, bottom - h + 2, f.palette.mid, f.palette.glow);
}

function paintThread(c: Canvas2, f: FxFrame, toY: number) {
  for (let y = 0; y < toY; y++) c.set(PX - 1 + ((y >> 2) % 2), y, y % 3 === 0 ? f.palette.light : f.palette.mid);
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const care = f.params['kind'] === 'care';
  const item = (bottom: number, squash: number, open: number) =>
    care ? paintEnvelope(c, f, bottom, squash, open) : paintGift(c, f, bottom, squash, open);

  if (f.reduced) {
    item(FEET, 0, 0);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'drop': {
      const bottom = 10 + easeIn(f.t) * (FEET - 10);
      paintThread(c, f, bottom - 10);
      item(bottom, 0, 0);
      break;
    }
    case 'land':
      paintThread(c, f, FEET - 10);
      item(FEET, Math.sin(f.t * Math.PI), 0);
      break;
    case 'open': {
      item(FEET, 0, easeOut(Math.min(1, f.t * 2)));
      // Lo que trae: destellos o corazones que suben
      for (let k = 0; k < 6; k++) {
        const local = Math.max(0, f.t - k * 0.08);
        if (local <= 0) continue;
        const x = PX - 8 + hash(k, 1, f.seed) * 16;
        const y = FEET - 12 - easeOut(local) * 28;
        if (care) heart(c, x - 2, y, f.palette.mid, f.palette.glow);
        else {
          c.set(x, y, f.palette.glow);
          c.set(x - 1, y, f.palette.light);
          c.set(x + 1, y, f.palette.light);
          c.set(x, y - 1, f.palette.light);
          c.set(x, y + 1, f.palette.light);
        }
      }
      break;
    }
    case 'retract': {
      // El paquete abierto se desvanece y la hebra sube
      if (hash(1, Math.floor(f.t * 6), f.seed) > f.t) item(FEET, 0, 1);
      paintThread(c, f, (FEET - 10) * (1 - easeIn(f.t)));
      break;
    }
  }
  c.flush(sink, f.palette.outline);
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
