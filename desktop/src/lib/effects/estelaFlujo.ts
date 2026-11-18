import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2 } from './fxMath';

/**
 * Estela del Flujo: en las carreras (zoomies) deja tres líneas de su propio Flujo del Éter que se
 * acortan hacia atrás (LORE §4). `params.dir` = 1 si corre a la derecha. Corta y pequeña: frecuente.
 * Rejilla 48×24 ×2; pies en la fila 22. Efecto menor.
 */

const EW = 48;
const EH = 24;
const ECX = 24;
const EFEET = 22;

function drawTrail(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(EW, EH);
  const dir = Number(f.params.dir ?? 1) >= 0 ? 1 : -1;
  const t = f.reduced ? 0.3 : f.t;
  const rows = [EFEET - 14, EFEET - 9, EFEET - 4];
  rows.forEach((y, i) => {
    // La línea nace detrás de la mascota y se acorta hacia atrás
    const len = Math.round((14 - i * 3) * (1 - t));
    const start = ECX - dir * (10 + i * 2);
    for (let k = 0; k < len; k++) {
      const x = start - dir * k;
      c.set(x, y, k < 2 ? f.palette.glow : k < len / 2 ? f.palette.light : f.palette.mid);
    }
  });
  c.flush(sink, f.palette.outline);
}

export const estelaFlujo: EffectDef = {
  id: 'estela-flujo',
  lore: 'En sus carreras deja una estela de su propio Flujo del Éter (LORE §4).',
  width: EW,
  height: EH,
  scale: 2,
  anchor: { x: ECX, y: EFEET },
  points: {},
  layer: 'behind',
  channel: 'minor',
  phases: [{ name: 'streak', ms: 380 }],
  reducedPhases: [{ name: 'streak', ms: 200 }],
  fps: 12,
  draw: drawTrail,
  opacity(f) {
    return f.reduced ? 1 - f.t : 1;
  },
};
