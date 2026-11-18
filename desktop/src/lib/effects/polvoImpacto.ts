import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut, hash } from './fxMath';

/**
 * Polvo de impacto: al caer tras lanzarlo, dos nubecillas a ras de suelo se abren hacia los lados.
 * Pequeño y corto a propósito: se ve muchas veces al día. Polvo de rampa fija (es polvo del
 * escritorio, LORE §10). Rejilla 40×12 ×2; pies en la fila 10. Efecto menor.
 */

const DUST = { outline: '#3a3a46', mid: '#a7a7b8', light: '#e4e4ee' };

// ---------- Polvo de impacto: rejilla 40×12, pies en la fila 10 ----------
const PW = 40;
const PH = 12;
const PCX = 20;
const PFEET = 10;

function drawDust(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(PW, PH);
  const t = f.reduced ? 0.4 : f.t;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      if (t > 0.5 && hash(k + (side > 0 ? 3 : 0), 1, f.seed) < (t - 0.5) * 2.2) continue;
      const x = PCX + side * (4 + easeOut(t) * (6 + k * 4));
      const y = PFEET - k - easeOut(t) * 2;
      const r = 1 + (k === 0 ? 1 : 0);
      for (let dy = -r; dy <= 0; dy++) for (let dx = -r; dx <= r; dx++) c.set(x + dx, y + dy, dy === -r ? DUST.light : DUST.mid);
    }
  }
  c.flush(sink, DUST.outline);
}

export const polvoImpacto: EffectDef = {
  id: 'polvo-impacto',
  lore: 'El polvo del escritorio que levanta al caer (efecto menor de tacto, sin lore propio; LORE §10 el Altar de Escritorio).',
  width: PW,
  height: PH,
  scale: 2,
  anchor: { x: PCX, y: PFEET },
  points: {},
  layer: 'behind',
  channel: 'minor',
  phases: [{ name: 'puff', ms: 360 }],
  reducedPhases: [{ name: 'puff', ms: 200 }],
  fps: 12,
  draw: drawDust,
  opacity(f) {
    return f.reduced ? 1 - f.t : 1;
  },
};
