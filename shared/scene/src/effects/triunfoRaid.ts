import type { EffectDef, FxFrame, FxPalette, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { flowPalette } from './palettes';
import { paintSheetFrame, type FrameSheet } from './sheet';
import RAID_FRAMES from './frames/triunfo-raid.json';

const SHEET = RAID_FRAMES as FrameSheet;

/**
 * Triunfo de raid: el jefe cae (spec 13: celebración al derrotarlo; LORE §4, cada jefe es un
 * Flujo desbocado de su elemento).
 *
 * Sobre la mascota aparece el jefe (dibujado con Nano Banana: lámina por roles) —un orbe astado en el Flujo de SU elemento
 * (`params.element`)—, se resquebraja con grietas de luz y estalla en bloques que llueven; en su
 * lugar queda una corona de laurel en el Flujo del Pockai, que celebró la victoria.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DELANTE.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BOSS = { x: CX, y: 22, r: 12 };
const CROWN_Y = 28;

/**
 * Frames dibujados con Nano Banana (`frames/triunfo-raid.json`, por roles):
 * 0 el jefe · 1 el jefe agrietado · 2 la corona de laurel.
 * El jefe se tiñe con el Flujo de SU elemento; la corona, con el del Pockai.
 */
const INTACT = 0;
const CRACKED = 1;
const CROWN = 2;
/** Base del jefe (33 filas: ocupa las filas 6-38, sobre la mascota). */
const BOSS_BOTTOM = BOSS.y + 16;

function paintBoss(c: Canvas2, p: FxPalette, frame: number) {
  paintSheetFrame(
    c,
    SHEET,
    frame,
    { outline: p.outline, bodyDeep: p.deep, bodyMid: p.mid, bodyLight: p.light, crack: p.glow, crackCore: '#ffffff' },
    { x: BOSS.x, bottom: BOSS_BOTTOM },
  );
}

function paintCrown(c: Canvas2, f: FxFrame, grow: number) {
  const { palette } = f;
  paintSheetFrame(
    c,
    SHEET,
    CROWN,
    { outline: palette.outline, crownDeep: palette.mid, crownMid: palette.light, crownLight: palette.glow },
    { x: CX, bottom: CROWN_Y + 7, scaleX: Math.max(0.15, grow) },
  );
}

function draw(sink: PixelSink, f: FxFrame): void {
  // Todo trae su contorno de la lámina: se vuelca sin añadir otro
  const c = new Canvas2(W, H);
  const boss = flowPalette(String(f.params['element'] ?? ''));

  if (f.reduced) {
    paintCrown(c, f, 1);
  } else {
    switch (f.phase) {
      case 'appear': {
        // Aparece tramado: cada vez más píxeles
        const tmp = new Canvas2(W, H);
        paintBoss(tmp, boss, INTACT);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const col = tmp.get(x, y);
          if (col && hash(x, y, f.seed) < easeOut(f.t)) c.set(x, y, col);
        }
        break;
      }
      case 'crack':
        paintBoss(c, boss, f.t < 0.35 ? INTACT : CRACKED);
        break;
      case 'shatter': {
        // El jefe agrietado se rompe en bloques de 4×4 que salen despedidos y caen
        const tmp = new Canvas2(W, H);
        paintBoss(tmp, boss, CRACKED);
        for (let y = 0; y < BOSS_BOTTOM + 1; y++) {
          for (let x = 0; x < W; x++) {
            const col = tmp.get(x, y);
            if (!col) continue;
            const bx = x >> 2;
            const by = y >> 2;
            const h = hash(bx, by, f.seed);
            if (h < span(f.t, 0.3, 1)) continue;
            const a = Math.atan2(y - BOSS.y, x - BOSS.x) + (h - 0.5);
            const d = easeOut(f.t) * (6 + h * 12);
            c.set(x + Math.cos(a) * d, y + Math.sin(a) * d + easeIn(f.t) * 30, col);
          }
        }
        break;
      }
      case 'crown': {
        // Crece, destella y, al final, se deshace en tramado
        const tmp = new Canvas2(W, H);
        paintCrown(tmp, f, easeOut(Math.min(1, f.t * 1.6)));
        const gone = span(f.t, 0.8, 1);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const col = tmp.get(x, y);
          if (col && hash(x, y, f.seed + 7) >= gone) c.set(x, y, col);
        }
        if (f.t > 0.6 && f.t < 0.85 && Math.floor(f.time / 125) % 2) c.set(CX - 0.5, CROWN_Y - 9, f.palette.glow);
        break;
      }
    }
  }
  c.flush(sink, null);
}

export const triunfoRaid: EffectDef = {
  id: 'triunfo-raid',
  lore: 'El jefe, un Flujo desbocado de su elemento, se resquebraja y queda una corona de luz para el Pockai (LORE §4).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { boss: { x: BOSS.x, y: BOSS.y } },
  layer: 'front',
  priority: 3,
  phases: [
    { name: 'appear', ms: 400 },
    { name: 'crack', ms: 500 },
    { name: 'shatter', ms: 600 },
    { name: 'crown', ms: 700 },
  ],
  reducedPhases: [
    { name: 'appear', ms: 0 },
    { name: 'crack', ms: 0 },
    { name: 'shatter', ms: 0 },
    { name: 'crown', ms: 1200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    return f.phase === 'crown' ? Math.min(1, (1 - f.t) * 3) : 1;
  },
};
