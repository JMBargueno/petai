import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { paintSheetFrame, type FrameSheet } from './sheet';
import COIL_FRAMES from './frames/hebra-invocacion.json';

/**
 * Hebra de invocación: la invocación rápida (LORE §8, la hebra que cada Custodio pone en el Nexo).
 *
 * Tu hebra baja del Nexo hasta el cursor, se enrosca en un ovillo a ras de suelo y de él brota la
 * mascota (fase `hold`, mientras PetView la hace aparecer); después la hebra se recoge hacia
 * arriba dejando chispas. Sustituye al teletransporte: la mascota nunca aparece de golpe.
 *
 * Rejilla 40×80 ×2; pies en la fila 76. Va DETRÁS de la mascota.
 */

const W = 40;
const H = 80;
const CX = 20;
const FEET = 76;
const SHEET = COIL_FRAMES as FrameSheet;

/** La hebra: una línea vertical que ondula un poco, con trenzado de dos tonos. */
function paintThread(c: Canvas2, f: FxFrame, fromY: number, toY: number) {
  const { palette } = f;
  for (let y = Math.max(0, Math.floor(fromY)); y <= toY; y++) {
    const time = f.reduced ? 0 : f.time;
    const wob = Math.round(Math.sin(y * 0.35 + time / 120) * 0.8);
    c.set(CX - 1 + wob, y, (y + Math.floor(time / 83)) % 3 === 0 ? palette.light : palette.mid);
  }
}

/**
 * Ovillo a los pies, dibujado con Nano Banana (`frames/hebra-invocacion.json`, por roles): la hebra
 * enroscada en espiral con su cabo subiendo del centro. `amount` 0..1 lo abre desde el centro.
 */
function paintCoil(c: Canvas2, f: FxFrame, amount: number) {
  const { palette } = f;
  paintSheetFrame(
    c,
    SHEET,
    0,
    { outline: palette.outline, deep: palette.deep, mid: palette.mid, light: palette.light, glow: palette.glow, core: palette.light },
    { x: CX, bottom: FEET, scaleX: Math.max(0.15, amount) },
  );
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  // El ovillo trae su contorno de la lámina: va en su propia capa, encima de la hebra
  const coil = new Canvas2(W, H);
  const { palette } = f;

  if (f.reduced) {
    paintThread(c, f, 0, FEET - 2);
    paintCoil(coil, f, 1);
    c.flush(sink, palette.outline);
    coil.flush(sink, null);
    return;
  }

  switch (f.phase) {
    case 'drop': {
      const head = easeIn(f.t) * (FEET - 2);
      paintThread(c, f, 0, head);
      c.set(CX - 1, head + 1, palette.glow);
      c.set(CX - 1, head + 2, palette.light);
      break;
    }
    case 'coil': {
      paintThread(c, f, 0, FEET - 2);
      paintCoil(coil, f, easeOut(f.t));
      // Chispazo al tocar el suelo
      if (f.t < 0.4) for (const dx of [-4, -2, 2, 4]) c.set(CX - 0.5 + dx, FEET - 2 - Math.abs(dx) / 2, palette.glow);
      break;
    }
    case 'hold': {
      paintThread(c, f, 0, FEET - 2);
      paintCoil(coil, f, 1);
      break;
    }
    case 'retract': {
      // La hebra se recoge hacia arriba; el ovillo se deshace en chispas
      const bottom = (FEET - 2) * (1 - easeIn(f.t));
      paintThread(c, f, 0, bottom);
      if (f.t < 0.5) paintCoil(coil, f, 1 - f.t * 2);
      for (let k = 0; k < 8; k++) {
        if (hash(k, 4, f.seed) < span(f.t, 0.3, 1)) continue;
        const x = CX - 12 + hash(k, 1, f.seed) * 24;
        const y = FEET - 2 - easeOut(f.t) * (6 + hash(k, 2, f.seed) * 14);
        c.set(x, y, k % 2 ? palette.glow : palette.light);
      }
      break;
    }
  }
  c.flush(sink, palette.outline);
  coil.flush(sink, null);
}

export const hebraInvocacion: EffectDef = {
  id: 'hebra-invocacion',
  lore: 'Tu hebra del Nexo baja hasta el cursor y de su ovillo brota el Pockai invocado (LORE §8).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { coil: { x: CX, y: FEET - 1 } },
  layer: 'behind',
  priority: 2,
  phases: [
    { name: 'drop', ms: 380 },
    { name: 'coil', ms: 300 },
    { name: 'hold', ms: 'hold' },
    { name: 'retract', ms: 460 },
  ],
  reducedPhases: [
    { name: 'drop', ms: 0 },
    { name: 'coil', ms: 160 },
    { name: 'hold', ms: 'hold' },
    { name: 'retract', ms: 160 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'coil') return f.t;
    if (f.phase === 'retract') return 1 - f.t;
    return 1;
  },
};
