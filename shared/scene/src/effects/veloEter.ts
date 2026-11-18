import { clamp01, easeIn, easeOut, hash, span } from './fxMath';
import type { EffectDef, FxFrame, FxPalette, PixelSink } from './types';

/**
 * Velo de Éter: el Santuario de Bolsillo corre una cortina tejida con las hebras del Flujo del
 * Pockai mientras cambia de forma (p. ej. al pasar la app a «solo hábitat»), y la vuelve a abrir
 * cuando la sala ya tiene su nuevo tamaño.
 *
 * Es un efecto de PANTALLA (`space: 'screen'`): no se cuelga del Pockai, cubre todo el lienzo.
 * Dibuja sobre `sink.width × sink.height`, así que vale para cualquier tamaño de viewport; la
 * rejilla de `width × height` solo se usa para la hoja de frames y los tests.
 *
 * Guion:
 * - `cierre`: cada hebra vertical (urdimbre) cae desde arriba con su propio retraso; la punta
 *   brilla y deja tras de sí la trama tejida sobre el vacío del Éter. Termina tapándolo todo.
 * - `hold`: velo cerrado, opaco. Cuentas de luz bajan por las hebras, cada una a su ritmo (quien lo lanza
 *   cambia lo que hay detrás mientras tanto).
 * - `apertura`: cada hebra se recoge hacia arriba, del centro hacia los lados.
 * Con movimiento reducido el velo es el dibujo quieto del `hold` y solo cambia su opacidad.
 */

const W = 64;
const H = 80;

/** Cada cuántas columnas pasa una hebra de urdimbre y cada cuántas filas una de trama. */
const WARP = 4;
const WEFT = 6;
/** Largo del recorrido de las cuentas de luz del hold (en celdas, más que el alto típico). */
const PULSE_PERIOD = 90;

/**
 * Celda del velo ya tejido. La urdimbre (vertical) es del tono medio del Flujo; la trama
 * (horizontal) pasa por encima y por debajo alternando, así que solo se ve a tramos. Entre
 * hebras, el vacío del Éter con alguna mota.
 */
function cloth(x: number, y: number, p: FxPalette, seed: number): string {
  const col = Math.floor(x / WARP);
  const row = Math.floor(y / WEFT);
  const warp = x % WARP === 0;
  const weft = y % WEFT === 0;
  const over = (col + row) % 2 === 0;
  if (warp && weft) return over ? p.deep : p.mid;
  if (warp) return p.mid;
  if (weft) return over ? p.deep : p.void1;
  const h = hash(x, y, seed);
  if (h < 0.006) return p.light;
  return h < 0.16 ? p.void1 : p.void0;
}

/** Retraso (0..0.4) con el que cae cada columna; las hebras de urdimbre van un poco antes. */
function delayOf(x: number, seed: number): number {
  const base = hash(x, 0, seed) * 0.32;
  return x % WARP === 0 ? base * 0.6 : base + 0.08;
}

/** Pinta cada columna desde arriba hasta `len(x)` con la punta encendida y contorno debajo. */
function drawCurtain(sink: PixelSink, f: FxFrame, len: (x: number) => number) {
  const p = f.palette;
  const { width, height } = sink;
  for (let x = 0; x < width; x++) {
    const tip = Math.min(height, Math.floor(len(x)));
    if (tip <= 0) continue;
    for (let y = 0; y < tip; y++) sink.set(x, y, cloth(x, y, p, f.seed));
    if (tip < height) {
      sink.set(x, tip - 1, p.glow);
      if (tip >= 2) sink.set(x, tip - 2, p.light);
      sink.set(x, tip, p.outline);
    }
  }
}

/** Cuentas de luz que bajan por cada hebra de urdimbre, cada una con su desfase. */
function drawBeads(sink: PixelSink, f: FxFrame) {
  const p = f.palette;
  for (let x = 0; x < sink.width; x += WARP) {
    const offset = hash(x, 3, f.seed) * PULSE_PERIOD;
    const speed = 40 + hash(x, 4, f.seed) * 30;
    const head = Math.floor(((f.time / 1000) * speed + offset) % PULSE_PERIOD) - 4;
    for (let k = 0; k < 4; k++) {
      const y = head - k;
      if (y >= 0 && y < sink.height) sink.set(x, y, k === 0 ? p.glow : p.light);
    }
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  const { width, height } = sink;
  if (f.reduced) {
    // Quieto: el velo entero, sin cuentas (solo cambia la opacidad)
    drawCurtain(sink, f, () => height);
    return;
  }
  if (f.phase === 'cierre') {
    drawCurtain(sink, f, (x) => {
      const d = delayOf(x, f.seed);
      const k = easeIn(span(f.t, d, d + 0.6));
      // Dientes de sierra: cada columna se pasa unos píxeles para que el borde no sea recto
      const tooth = Math.floor(hash(x, 1, f.seed) * 4);
      return k >= 1 ? height : k * (height + tooth);
    });
    return;
  }
  if (f.phase === 'hold') {
    drawCurtain(sink, f, () => height);
    drawBeads(sink, f);
    return;
  }
  if (f.phase === 'apertura') {
    // Cada hebra se recoge hacia arriba; el centro primero y los lados después
    const cx = (width - 1) / 2;
    drawCurtain(sink, f, (x) => {
      const dist = cx > 0 ? Math.abs(x - cx) / cx : 0;
      const start = dist * 0.5 + hash(x, 2, f.seed) * 0.12;
      const k = easeOut(span(f.t, start, start + 0.38));
      return k >= 1 ? 0 : (1 - k) * height;
    });
  }
}

export const veloEter: EffectDef = {
  id: 'velo-eter',
  lore: 'Velo tejido con las hebras del Flujo que el Santuario de Bolsillo corre mientras cambia de forma; al abrirse, la sala ya es otra (LORE §10).',
  width: W,
  height: H,
  scale: 4,
  anchor: { x: 0, y: H - 1 },
  points: {},
  phases: [
    { name: 'cierre', ms: 420 },
    { name: 'hold', ms: 'hold' },
    { name: 'apertura', ms: 480 },
  ],
  reducedPhases: [
    { name: 'cierre', ms: 160 },
    { name: 'hold', ms: 'hold' },
    { name: 'apertura', ms: 200 },
  ],
  fps: 12,
  draw,
  space: 'screen',
  channel: 'moment',
  layer: 'front',
  priority: 9,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'cierre') return clamp01(f.t);
    if (f.phase === 'apertura') return clamp01(1 - f.t);
    return 1;
  },
};
