import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { paintSheetFrame, type FrameSheet } from './sheet';
import ALTAR_FRAMES from './frames/altar-santuario.json';

const SHEET = ALTAR_FRAMES as FrameSheet;

/**
 * Altar del Santuario: la puerta de casa (LORE §10, «Altar de Escritorio» / Santuario de Bolsillo).
 *
 * Dibujado con Nano Banana (lámina por roles, ver `paintAltar`). Distinto del portal del Nexo (que
 * lleva fuera): un pórtico de piedra con dintel, sello y runas del
 * Flujo emerge del suelo, las runas se encienden de abajo arriba, sus dos hojas se abren hacia dentro
 * y dejan ver la luz cálida de casa. La mascota entra (o sale) en la espera; las hojas se cierran y
 * el altar vuelve a hundirse en el escritorio levantando polvo.
 *
 * Rejilla 48×66 ×2; pies en la fila 63, el polvo baja a las dos filas de debajo.
 */

const W = 48;
const H = 66;
const CX = 24;
const FEET = 63;
/**
 * Frames del altar dibujados con Nano Banana (`frames/altar-santuario.json`, por roles):
 * 0 cerrado con las runas apagadas · 1 cerrado con runas · 2 hojas entreabiertas · 3 abierto.
 * La piedra y las runas toman el Flujo del Pockai; la madera es madera y la luz de casa, cálida
 * del Flujo (light y glow).
 */
const DARK = 0;
const SHUT = 1;
const AJAR = 2;
const OPEN = 3;
const WOOD = { deep: '#5a3a22', mid: '#8a5a32' };

/**
 * Dibuja el altar hundido `dy` filas (lo que queda bajo el suelo no se ve). `runes` 0..1: hasta
 * qué altura, desde abajo, están encendidas las runas.
 */
function paintAltar(c: Canvas2, f: FxFrame, frame: number, dy: number, runes: number) {
  const { palette } = f;
  const fixed: Record<string, string> = {
    outline: palette.outline,
    stoneDeep: palette.deep,
    stoneMid: palette.mid,
    stoneLight: palette.light,
    woodDeep: WOOD.deep,
    woodMid: WOOD.mid,
    home: palette.light,
    homeCore: palette.glow,
  };
  paintSheetFrame(
    c,
    SHEET,
    frame,
    (role, y, h) => (role === 'rune' ? (1 - y / h <= runes ? palette.glow : palette.deep) : fixed[role]),
    { x: CX, bottom: FEET + dy, clipBottom: FEET },
  );
}

/** Polvo a ras de suelo (filas 62-65). */
function paintDust(c: Canvas2, f: FxFrame, t: number) {
  const { palette } = f;
  for (let k = 0; k < 14; k++) {
    if (hash(k, 2, f.seed) < t) continue;
    const side = k % 2 ? 1 : -1;
    const x = CX + side * (17 + easeOut(t) * (4 + hash(k, 3, f.seed) * 6));
    const y = FEET + 1 - hash(k, 4, f.seed) * 3 - t * 2;
    c.set(x, y, k % 3 ? palette.light : palette.mid);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Dos capas: el altar trae su contorno de la lámina; el polvo lleva el del motor
  const altar = new Canvas2(W, H);
  const fx = new Canvas2(W, H);

  if (f.reduced) {
    paintAltar(altar, f, OPEN, 0, 1);
  } else {
    switch (f.phase) {
      case 'rise':
        paintAltar(altar, f, DARK, Math.round((1 - easeOut(f.t)) * (FEET - 4)), 0);
        paintDust(fx, f, f.t);
        break;
      case 'runes':
        paintAltar(altar, f, SHUT, 0, easeOut(f.t));
        break;
      case 'open':
        paintAltar(altar, f, f.t < 0.5 ? AJAR : OPEN, 0, 1);
        break;
      case 'hold':
        paintAltar(altar, f, OPEN, 0, 1);
        break;
      case 'close':
        paintAltar(altar, f, f.t < 0.4 ? AJAR : SHUT, 0, 1 - span(f.t, 0.5, 1));
        break;
      case 'sink':
        paintAltar(altar, f, DARK, Math.round(easeIn(f.t) * (FEET - 4)), 0);
        paintDust(fx, f, f.t);
        break;
    }
  }
  altar.flush(sink, null);
  fx.flush(sink, f.palette.outline);
}

export const altarSantuario: EffectDef = {
  id: 'altar-santuario',
  lore: 'El Altar de Escritorio, la puerta del Santuario de Bolsillo: emerge, abre sus hojas a la luz de casa y vuelve a hundirse (LORE §10).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { door: { x: CX, y: 42 } },
  layer: 'behind',
  priority: 3,
  phases: [
    { name: 'rise', ms: 480 },
    { name: 'runes', ms: 300 },
    { name: 'open', ms: 380 },
    { name: 'hold', ms: 'hold' },
    { name: 'close', ms: 340 },
    { name: 'sink', ms: 460 },
  ],
  reducedPhases: [
    { name: 'rise', ms: 200 },
    { name: 'runes', ms: 0 },
    { name: 'open', ms: 0 },
    { name: 'hold', ms: 'hold' },
    { name: 'close', ms: 0 },
    { name: 'sink', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'rise') return f.t;
    if (f.phase === 'sink') return 1 - f.t;
    return 1;
  },
};
