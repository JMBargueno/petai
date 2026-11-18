import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { paintSheetFrame, type FrameSheet } from './sheet';
import EGG_FRAMES from './frames/huevo-grietas.json';

/**
 * Huevo con grietas de luz: la eclosión vista en el escritorio (LORE §1: el Telar cristaliza el
 * Códice y la eclosión «descomprime la visualSeed»).
 *
 * Un huevo de pixel art (dibujado con Nano Banana: lámina por roles, ver `paintEgg`) se zarandea (fase `hold`, que se llama así para que el motor la suelte: dura lo que el panel tarde en recibir a la
 * recién nacida); cuando llegan las grietas, la luz del Flujo de la recién nacida se cuela por
 * ellas cada vez con más fuerza y el huevo estalla en esquirlas. La cáscara es cáscara (rampa fija);
 * la luz es del Flujo, y quien lo lanza puede cambiar la paleta al llegar a `crack`.
 *
 * Rejilla 40×56 ×2; pies en la fila 53. Va DETRÁS, al lado de la mascota.
 */

const W = 40;
const H = 56;
const CX = 20;
const FEET = 53;
const EGG = { x: CX, y: 39, rx: 11, ry: 14 };
const SHELL = { outline: '#4a3b2a', deep: '#b09060', mid: '#e8d8b0', light: '#fff4d8' };
const EGG_SHEET = EGG_FRAMES as FrameSheet;

function inEgg(x: number, y: number, ox = 0) {
  const dx = (x + 0.5 - EGG.x - ox) / EGG.rx;
  const dy = (y + 0.5 - EGG.y) / EGG.ry;
  // Más estrecho arriba, como un huevo
  const k = dy < 0 ? 1 + -dy * 0.25 : 1;
  return dx * dx * k * k + dy * dy <= 1;
}

/**
 * Frames del huevo dibujados con Nano Banana (`frames/huevo-grietas.json`, por roles):
 * 0 intacto · 1 una grieta · 2 tres grietas · 3 cubierto de grietas con haces · 4 la tapa salta.
 * La cáscara lleva su rampa fija; la luz de las grietas, el Flujo de quien nace.
 */
const INTACT = 0;
const CRACK_1 = 1;
const CRACK_3 = 2;
const BEAMS = 3;
const POP = 4;

function paintEgg(c: Canvas2, f: FxFrame, frame: number, ox: number) {
  paintSheetFrame(
    c,
    EGG_SHEET,
    frame,
    {
      outline: SHELL.outline,
      shellDeep: SHELL.deep,
      shellMid: SHELL.mid,
      shellLight: SHELL.light,
      crackCore: f.palette.glow,
      crackHalo: f.palette.mid,
    },
    { x: CX + ox, bottom: FEET },
  );
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Dos capas: el huevo trae su contorno de la lámina; esquirlas y anillo llevan el del motor
  const egg = new Canvas2(W, H);
  const fx = new Canvas2(W, H);
  if (f.reduced) {
    paintEgg(egg, f, BEAMS, 0);
  } else {
    const wobble = (amp: number) => (Math.floor(f.time / 166) % 2 === 0 ? amp : -amp);
    switch (f.phase) {
      case 'hold': // tiembla mientras espera a saber quién nace
        paintEgg(egg, f, INTACT, Math.floor(f.time / 500) % 2 === 0 ? wobble(1) : 0);
        break;
      case 'crack':
        paintEgg(egg, f, f.t < 0.3 ? CRACK_1 : f.t < 0.6 ? CRACK_3 : BEAMS, f.t > 0.6 ? wobble(1) : 0);
        break;
      case 'burst': {
        // La tapa salta y, después, la cáscara se deshace en esquirlas con un anillo de luz
        if (f.t < 0.35) paintEgg(egg, f, POP, 0);
        else {
          for (let y = EGG.y - EGG.ry - 2; y <= FEET; y++) {
            for (let x = 0; x < W; x++) {
              if (!inEgg(x, y)) continue;
              const bx = x >> 2;
              const by = y >> 2;
              const h = hash(bx, by, f.seed);
              const t = span(f.t, 0.35, 1);
              if (h < t * 1.1) continue;
              const a = Math.atan2(y - EGG.y, x - EGG.x) + (h - 0.5);
              const d = easeOut(t) * (8 + h * 10);
              fx.set(x + Math.cos(a) * d, y + Math.sin(a) * d + easeIn(t) * 6, (bx + by) % 2 ? SHELL.mid : SHELL.light);
            }
          }
        }
        const r = 4 + easeOut(f.t) * 16;
        if (f.t < 0.7) for (let a = 0; a < Math.PI * 2; a += 0.1) fx.set(EGG.x - 0.5 + Math.cos(a) * r, EGG.y + Math.sin(a) * r, f.palette.glow);
        break;
      }
    }
  }
  fx.flush(sink, SHELL.outline);
  egg.flush(sink, null);
}

export const huevoGrietas: EffectDef = {
  id: 'huevo-grietas',
  lore: 'El Códice cristalizado por el Telar se agrieta con la luz del Flujo de quien va a nacer (LORE §1).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { egg: { x: EGG.x, y: EGG.y } },
  layer: 'behind',
  priority: 3,
  phases: [
    { name: 'hold', ms: 'hold' },
    { name: 'crack', ms: 1200 },
    { name: 'burst', ms: 600 },
  ],
  reducedPhases: [
    { name: 'hold', ms: 'hold' },
    { name: 'crack', ms: 600 },
    { name: 'burst', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'burst' ? 1 - f.t : 1;
  },
};
