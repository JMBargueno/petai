import type { EffectDef, FxFrame, PixelSink } from './types';
import { clamp01, easeIn, easeOut } from './fxMath';

/**
 * Hebra de toque: el Pockai tiende una hebra de su Flujo hasta un objeto del Éter (el reloj del
 * pomodoro) para manejarlo a distancia: pausarlo, reanudarlo o devolverlo. Es la misma hebra que
 * cada Custodio pone en el Nexo (LORE §8), usada como una mano larga.
 *
 * Efecto de PANTALLA (`space: 'screen'`): va de un punto a otro cualquiera del lienzo.
 * Params (celdas nativas del lienzo): `x0, y0` = de dónde sale (la patita del Pockai),
 * `x1, y1` = dónde toca (el objeto; quien la lanza puede moverlo frame a frame).
 * Guion:
 * - `lanzar`: la hebra crece en arco desde el Pockai hasta el objeto.
 * - `hold`: tocando; cuentas de luz corren hacia el objeto y la punta chispea.
 * - `recoger`: la hebra se recoge desde el objeto hacia el Pockai.
 * Con movimiento reducido es la hebra entera y quieta, con un fundido.
 *
 * La rejilla 64×80 solo sirve para la hoja de frames y los tests (sin params: de abajo a la
 * izquierda hacia arriba a la derecha).
 */

const W = 64;
const H = 80;

function num(v: string | number | undefined, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Tramo visible de la hebra (fracciones 0..1 desde el Pockai). */
function visible(f: FxFrame): number {
  if (f.reduced) return 1;
  if (f.phase === 'lanzar') return easeOut(f.t);
  if (f.phase === 'recoger') return 1 - easeIn(f.t);
  return 1;
}

function draw(sink: PixelSink, f: FxFrame): void {
  const { palette: p } = f;
  const x0 = num(f.params['x0'], 8);
  const y0 = num(f.params['y0'], H - 10);
  const x1 = num(f.params['x1'], W - 8);
  const y1 = num(f.params['y1'], 10);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const reach = visible(f);
  if (reach <= 0) return;
  const time = f.reduced ? 0 : f.time;
  // Normal (la hebra se arquea hacia arriba, como un hilo que se lanza)
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const arc = Math.min(10, len * 0.12);
  const n = Math.ceil(len);
  const last = Math.floor(reach * n);
  const touching = f.phase === 'hold' || (f.phase === 'lanzar' && f.t > 0.85);

  const pts: Array<{ x: number; y: number; c: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i <= last; i++) {
    const s = i / n;
    const wob = f.reduced ? 0 : Math.sin(s * len * 0.22 + time / 90) * Math.sin(s * Math.PI) * 1.2;
    const off = Math.sin(s * Math.PI) * arc + wob;
    const x = Math.round(x0 + dx * s + nx * off);
    const y = Math.round(y0 + dy * s + ny * off);
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let c = (i + Math.floor(time / 83)) % 3 === 0 ? p.light : p.mid;
    // Cuentas de luz corriendo hacia el objeto mientras toca
    if (f.phase === 'hold' && !f.reduced && (i - Math.floor(time / 40)) % 14 === 0) c = p.glow;
    pts.push({ x, y, c });
  }

  // Contorno de 1 px alrededor (se lee sobre cualquier fondo) y luego la hebra encima
  for (const pt of pts) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!seen.has(`${pt.x + ox},${pt.y + oy}`)) sink.set(pt.x + ox, pt.y + oy, p.outline);
    }
  }
  for (const pt of pts) sink.set(pt.x, pt.y, pt.c);

  // Punta: chispa en estrella sobre el objeto
  if (touching && pts.length) {
    const tip = pts[pts.length - 1];
    const big = f.reduced || Math.floor(time / 83) % 2 === 0;
    const r = big ? 2 : 1;
    for (let d = -r; d <= r; d++) {
      sink.set(tip.x + d, tip.y, Math.abs(d) <= 1 ? p.glow : p.light);
      sink.set(tip.x, tip.y + d, Math.abs(d) <= 1 ? p.glow : p.light);
    }
    if (!big) {
      for (const [ox, oy] of [[2, 2], [-2, -2], [2, -2], [-2, 2]]) sink.set(tip.x + ox, tip.y + oy, p.light);
    }
  }
}

export const hebraToque: EffectDef = {
  id: 'hebra-toque',
  lore: 'Hebra del Flujo que el Pockai tiende hasta un objeto del Éter para manejarlo a distancia, como una mano larga (LORE §8, la hebra del Custodio).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: 0, y: 0 },
  points: {},
  phases: [
    { name: 'lanzar', ms: 300 },
    { name: 'hold', ms: 'hold' },
    { name: 'recoger', ms: 260 },
  ],
  reducedPhases: [
    { name: 'lanzar', ms: 120 },
    { name: 'hold', ms: 'hold' },
    { name: 'recoger', ms: 120 },
  ],
  fps: 12,
  draw,
  space: 'screen',
  channel: 'minor',
  layer: 'front',
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'lanzar') return clamp01(f.t);
    if (f.phase === 'recoger') return clamp01(1 - f.t);
    return 1;
  },
};
