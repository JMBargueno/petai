import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, clamp01, easeIn, easeOut, hash } from './fxMath';

/**
 * Grieta del Éter: el Pockai rasga un momento el Éter para sacar un objeto que guarda allí (el
 * reloj del pomodoro, y los que vengan) o para devolverlo. Es la misma tela que cruza por el portal,
 * pero en pequeño: una rendija con forma de ojo, borde del Flujo y vacío dentro.
 *
 * Params: `dir` = `'out'` (el objeto sale: motas que brotan) o `'in'` (vuelve: motas que se
 * tragan). Guion:
 * - `apertura`: la rendija se abre desde una línea.
 * - `hold`: abierta; quien la lanza hace aparecer o hundirse el objeto y la suelta.
 * - `cierre`: se cierra y deja un destello en cruz.
 * Con movimiento reducido es la rendija quieta, abierta, y solo cambia la opacidad.
 *
 * Rejilla 48×56 ×2; el anclaje es el CENTRO del objeto (no unos pies).
 */

const W = 48;
const H = 56;
const CX = 24;
const CY = 28;
const MAX_HH = 22;
const MAX_HW = 9;
const MOTES = 7;

function openness(f: FxFrame): number {
  if (f.reduced) return 1;
  if (f.phase === 'apertura') return easeOut(f.t);
  if (f.phase === 'cierre') return 1 - easeIn(f.t);
  return 1;
}

function draw(sink: PixelSink, f: FxFrame): void {
  const { palette: p, seed } = f;
  const c = new Canvas2(W, H);
  const open = openness(f);
  const time = f.reduced ? 0 : f.time;
  const dirOut = f.params['dir'] !== 'in';

  if (open > 0.02) {
    const hh = Math.max(2, Math.round(MAX_HH * (0.25 + 0.75 * open)));
    const hw = MAX_HW * open;
    const shimmer = Math.floor(time / 166);
    for (let y = -hh; y <= hh; y++) {
      const k = Math.max(0, 1 - (y / hh) * (y / hh));
      const jag = open > 0.5 && hash(3, y + 40, seed) < 0.3 ? 1 : 0;
      const half = Math.round(hw * Math.sqrt(k)) + jag;
      for (let x = -half; x <= half; x++) {
        let color: string;
        if (Math.abs(x) >= half || Math.abs(y) === hh) {
          color = hash(x + 50, y + 50, seed + shimmer) > 0.72 ? p.glow : p.light;
        } else {
          const swirl = (x * x + y * y * 0.4 + time / 60) % 7;
          color = swirl < 1 ? p.void1 : p.void0;
          if (hash(x + 9, y + 9, seed + shimmer) < 0.04) color = p.mid;
        }
        c.set(CX + x, CY + y, color);
      }
    }

    // Motas del Flujo: brotan de la rendija (sale) o caen hacia ella (vuelve)
    if (open > 0.3 && !(f.phase === 'cierre' && f.t > 0.5)) {
      for (let i = 0; i < MOTES; i++) {
        const angle = hash(i, 1, seed) * Math.PI * 2;
        const cycle = f.reduced ? 0.5 : (time / 700 + hash(i, 2, seed)) % 1;
        const r = dirOut ? 6 + cycle * 16 : 22 - cycle * 16;
        const mx = CX + Math.cos(angle) * r * 0.75;
        const my = CY + Math.sin(angle) * r;
        c.set(mx, my, p.glow);
        // Cola hacia donde viene
        const back = dirOut ? -1.4 : 1.4;
        c.set(mx + Math.cos(angle) * back, my + Math.sin(angle) * back, p.mid);
      }
    }
  }

  // Al cerrarse, la costura deja un destello en cruz
  if (!f.reduced && f.phase === 'cierre' && f.t > 0.6) {
    const s = Math.round(1 + 3 * clamp01((1 - f.t) / 0.4));
    for (let d = -s; d <= s; d++) {
      c.set(CX + d, CY, Math.abs(d) <= 1 ? p.glow : p.light);
      c.set(CX, CY + d, Math.abs(d) <= 1 ? p.glow : p.light);
    }
  }

  c.flush(sink, p.outline);
}

export const grietaObjeto: EffectDef = {
  id: 'grieta-objeto',
  lore: 'Rendija del Éter por la que el Pockai saca o devuelve los objetos que guarda allí, como el reloj del pomodoro (LORE §2, el Éter).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: CY },
  points: { center: { x: CX, y: CY } },
  phases: [
    { name: 'apertura', ms: 280 },
    { name: 'hold', ms: 'hold' },
    { name: 'cierre', ms: 320 },
  ],
  reducedPhases: [
    { name: 'apertura', ms: 120 },
    { name: 'hold', ms: 'hold' },
    { name: 'cierre', ms: 140 },
  ],
  fps: 12,
  draw,
  channel: 'minor',
  layer: 'behind',
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'apertura') return clamp01(f.t);
    if (f.phase === 'cierre') return clamp01(1 - f.t);
    return 1;
  },
};
