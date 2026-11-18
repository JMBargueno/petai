import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeOut } from './fxMath';
import { paintSheetFrame, type FrameSheet } from './sheet';
import HAND_FRAMES from './frames/manitas-espirituales.json';

const SHEET = HAND_FRAMES as FrameSheet;

/**
 * Manitas espirituales: el Pockai despierto actúa por su Custodio (LORE §5: con la Chispa de Hermes
 * le crecen «manitas espirituales» que abren portales web y sostienen pergaminos).
 *
 * Dos manitas de luz (dibujadas con Nano Banana: lámina por roles) aparecen a los lados del pecho y se juntan delante sosteniendo lo que hace:
 * `params.tool` = `open_url` → un mini portal con una página (tres líneas); `read_clipboard` → un
 * pergamino. Efecto menor: no tapa ni bloquea a la mascota.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const CHEST = { x: CX, y: 54 };

/**
 * Frames dibujados con Nano Banana (`frames/manitas-espirituales.json`, por roles):
 * 0 la mano (la derecha, señalando a la derecha; la izquierda es su espejo) · 1 el portal web · 2 el pergamino.
 * Manos y portal toman el Flujo del Pockai; el pergamino es papel con tinta del Flujo.
 */
const HAND = 0;
const PORTAL = 1;
const SCROLL = 2;
const PAPER = { light: '#fff0c8', mid: '#d8c088' };

function colors(f: FxFrame): Record<string, string> {
  const { palette } = f;
  return {
    outline: palette.outline,
    deep: palette.deep,
    mid: palette.mid,
    light: palette.light,
    glow: palette.glow,
    void: palette.void1,
    paperLight: PAPER.light,
    paperMid: PAPER.mid,
    ink: palette.deep,
  };
}

/** Las dos manos a `d` columnas del centro del pecho, `dy` filas desplazadas. */
function paintHands(c: Canvas2, f: FxFrame, d: number, dy: number) {
  const y = CHEST.y + 3 + dy;
  paintSheetFrame(c, SHEET, HAND, colors(f), { x: CHEST.x - d - 5, bottom: y, flipX: true });
  paintSheetFrame(c, SHEET, HAND, colors(f), { x: CHEST.x + d + 5, bottom: y });
}

/** Lo que sostienen (portal o pergamino), abriéndose en horizontal (`open` 0..1). */
function paintItem(c: Canvas2, f: FxFrame, url: boolean, open: number) {
  const frame = url ? PORTAL : SCROLL;
  const h = SHEET.frames[frame]!.length;
  paintSheetFrame(c, SHEET, frame, colors(f), { x: CHEST.x, bottom: CHEST.y - 4 + Math.floor(h / 2), scaleX: Math.max(0.1, open) });
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Todo trae su contorno de la lámina
  const c = new Canvas2(W, H);
  const url = f.params['tool'] !== 'read_clipboard';

  if (f.reduced) {
    paintItem(c, f, url, 1);
    paintHands(c, f, 10, 0);
  } else {
    switch (f.phase) {
      case 'reach':
        paintHands(c, f, Math.round(20 - easeOut(f.t) * 10), 0);
        break;
      case 'hold': {
        paintItem(c, f, url, easeOut(Math.min(1, f.t * 2.5)));
        paintHands(c, f, 10, Math.round(Math.sin(f.time / 120)));
        break;
      }
      case 'vanish':
        if (f.t < 0.8) paintItem(c, f, url, 1 - f.t);
        if (f.t < 0.7) paintHands(c, f, 10, -Math.round(f.t * 8));
        break;
    }
  }
  c.flush(sink, null);
}

export const manitasEspirituales: EffectDef = {
  id: 'manitas-espirituales',
  lore: 'Las manitas espirituales del Pockai despierto abren un portal web o sostienen un pergamino (LORE §5).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { chest: CHEST },
  layer: 'front',
  channel: 'minor',
  phases: [
    { name: 'reach', ms: 260 },
    { name: 'hold', ms: 700 },
    { name: 'vanish', ms: 300 },
  ],
  reducedPhases: [
    { name: 'reach', ms: 0 },
    { name: 'hold', ms: 700 },
    { name: 'vanish', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'vanish') return 1 - f.t;
    return 1;
  },
};
