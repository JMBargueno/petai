import type { EffectDef, FxFrame, PixelSink } from './types';
import { frameOrigin, frameSize, type FrameSheet } from './sheet';
import ARCH_FRAMES from './frames/portal-nexo.json';

/**
 * Portal de hebras del Nexo (LORE §8: «las visitas entre Santuarios viajan por las hebras del
 * Nexo»; §2: el Telar). Un arco de tres hebras trenzadas del Flujo del Pockai, con una clave en
 * rombo —el nudo del Nexo, atado a la red por una hebra que sube—. El arco y la clave están
 * dibujados con Nano Banana (`frames/portal-nexo.json`, por roles); lo demás es procedural.
 *
 * Las hebras bajan desde la clave hasta los pies; dentro, una trama se teje y se abre como una
 * cortina y deja ver el Éter; el Flujo se derrama en un charco de luz a los pies. Al terminar, la
 * trama se cierra y las hebras se deshilachan y caen. Un destello recorre la trenza mientras está
 * abierto.
 *
 * Rejilla nativa 44×66, ×2 en pantalla: los pies del arco (fila 63) quedan a la altura de los de
 * la mascota y las dos filas de debajo son el charco de luz.
 */

const W = 44;
const H = 66;
const CX = 22;
const BOTTOM = 63;

const SHEET = ARCH_FRAMES as FrameSheet;
const POS = { x: CX, bottom: BOTTOM };
const ORIGIN = frameOrigin(SHEET, 0, POS);
const SIZE = frameSize(SHEET, 0);
const ROWS = SHEET.frames[0]!;

/** Hasta aquí llegan los hombros del arco; por debajo, los postes son rectos. */
const SPRING_Y = ORIGIN.y + Math.round(SIZE.h * 0.44);
/** Radio medio de la trenza (para recorrer el arco de pie a pie). */
const R_MID = SIZE.w / 2 - 3;
const POST_LEN = BOTTOM - SPRING_Y;
const ARC_LEN = Math.PI * R_MID;
const TOTAL_LEN = POST_LEN * 2 + ARC_LEN;

const cell = (x: number, y: number): string | undefined => ROWS[y - ORIGIN.y]?.[x - ORIGIN.x];
const filled = (x: number, y: number) => {
  const ch = cell(x, y);
  return ch !== undefined && ch !== '.';
};

/**
 * La boca del portal, sacada de la propia lámina: en cada fila, el hueco entre la cara interior
 * de los dos lados del arco (desde el centro hacia fuera). Filas sin hueco (la clave) no cuentan.
 */
const MOUTH_ROWS = new Map<number, [number, number]>();
for (let y = ORIGIN.y; y <= BOTTOM; y++) {
  if (filled(CX, y) || filled(CX - 1, y)) continue;
  let l = CX - 1;
  while (l >= ORIGIN.x && !filled(l, y)) l--;
  let r = CX;
  while (r < ORIGIN.x + SIZE.w && !filled(r, y)) r++;
  // Solo si está cerrada por los dos lados (por encima de la clave no hay boca)
  if (l >= ORIGIN.x && r < ORIGIN.x + SIZE.w && y > ORIGIN.y + 6) MOUTH_ROWS.set(y, [l + 1, r - 1]);
}
const MOUTH_TOP = Math.min(...MOUTH_ROWS.keys());
/** Media anchura máxima de la boca (la cortina se abre hasta aquí). */
const MOUTH_HALF = Math.max(...[...MOUTH_ROWS.values()].map(([a, b]) => (b - a + 1) / 2));
/** Centro del vacío (boca del portal), donde entra la mascota. */
const MOUTH = { x: CX, y: Math.round((MOUTH_TOP + BOTTOM) / 2) + 2 };

function insideMouth(x: number, y: number): boolean {
  const span = MOUTH_ROWS.get(y);
  return !!span && x >= span[0] && x <= span[1];
}

/** Posición 0..1 a lo largo del marco: 0 = pie izquierdo, 0,5 = clave del arco, 1 = pie derecho. */
function archS(x: number, y: number): number {
  const dx = x + 0.5 - CX;
  const dy = y + 0.5 - SPRING_Y;
  if (dy >= 0) {
    const up = BOTTOM + 1 - (y + 0.5);
    return dx < 0 ? up / TOTAL_LEN : 1 - up / TOTAL_LEN;
  }
  const theta = Math.atan2(-dy, dx); // π a la izquierda, 0 a la derecha
  return Math.min(1, Math.max(0, (POST_LEN + (Math.PI - theta) * R_MID) / TOTAL_LEN));
}

/** Hash entero estable → 0..1 (sin Math.random: el dibujo es determinista con la semilla). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Px = { x: number; y: number; color: string; s: number };

/**
 * Píxeles del arco (trenza, clave y hebra), con su posición `s` a lo largo del marco. `flow`
 * mueve un destello por la trenza; `lit` enciende el corazón de la clave.
 */
function framePixels(f: FxFrame, flow: number, lit: boolean): Px[] {
  const { palette } = f;
  const colors: Record<string, string> = {
    outline: palette.outline,
    braidDeep: palette.deep,
    braidMid: palette.mid,
    braidLight: palette.light,
    glow: lit ? palette.glow : palette.light,
  };
  const out: Px[] = [];
  ROWS.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const k = row.charCodeAt(rx) - 97;
      if (k < 0) continue;
      const role = SHEET.roles[k]!;
      const x = ORIGIN.x + rx;
      const y = ORIGIN.y + ry;
      const s = archS(x, y);
      let color = colors[role]!;
      // Destello que corre por la trenza (dos, uno por cada lado)
      if (flow >= 0 && role === 'braidLight') {
        const pos = (s * TOTAL_LEN - flow * 10) % 24;
        if (pos > -2 && pos < 1.5) color = palette.glow;
      }
      out.push({ x, y, color, s });
    }
  });
  return out;
}

/** Charco de luz del Flujo a los pies (filas 64-65); `amount` 0..1 es su ancho. */
function paintPool(sink: PixelSink, f: FxFrame, amount: number) {
  if (amount <= 0) return;
  const { palette } = f;
  const shimmer = f.reduced ? 0 : Math.floor(f.time / 250) % 2;
  const rows: Array<[number, number]> = [
    [64, 17],
    [65, 12],
  ];
  for (const [y, half] of rows) {
    const h = Math.round(half * amount);
    for (let x = CX - h; x < CX + h; x++) {
      const edge = x === CX - h || x === CX + h - 1;
      const dither = (x + y + shimmer) % 2 === 0;
      const color = y === 64 ? (edge ? palette.deep : dither ? palette.light : palette.mid) : dither ? palette.mid : palette.deep;
      sink.set(x, y, color);
    }
  }
}

/** El vacío del Éter con un remolino que gira hacia el Nexo. */
function paintVoid(sink: PixelSink, f: FxFrame, openHalf: number) {
  const { palette } = f;
  const spin = f.reduced ? 0 : f.time / 260;
  for (let y = MOUTH_TOP; y <= BOTTOM; y++) {
    for (let x = 0; x < W; x++) {
      if (!insideMouth(x, y)) continue;
      if (Math.abs(x + 0.5 - CX) > openHalf) continue;
      const dx = x + 0.5 - MOUTH.x;
      const dy = (y + 0.5 - MOUTH.y) * 0.8;
      const rho = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const swirl = Math.sin(ang * 2 - rho * 0.55 + spin);
      let color = rho < 9 ? palette.void1 : palette.void0;
      if (swirl > 0.88 && rho > 2) color = rho < 7 ? palette.mid : palette.deep;
      else if (swirl > 0.7 && rho > 3) color = palette.deep;
      if (rho < 1.6) color = palette.glow;
      else if (rho < 2.6) color = palette.light;
      // Nodos lejanos del Éter que titilan
      const twinkle = f.reduced ? 0 : Math.floor(f.time / 330);
      if (color === palette.void0 && hash(x, y, f.seed + twinkle) < 0.025) color = palette.light;
      sink.set(x, y, color);
    }
  }
}

/** La trama del telar: hilos horizontales que llenan la boca hasta la fracción `amount`. */
function paintWeft(sink: PixelSink, f: FxFrame, amount: number, openHalf: number) {
  const { palette } = f;
  for (let y = MOUTH_TOP; y <= BOTTOM; y++) {
    const fy = (y - MOUTH_TOP) / (BOTTOM - MOUTH_TOP);
    if (fy > amount) continue;
    for (let x = 0; x < W; x++) {
      if (!insideMouth(x, y)) continue;
      if (Math.abs(x + 0.5 - CX) <= openHalf) continue;
      const even = (y - MOUTH_TOP) % 2 === 0;
      // Cada hilo pasa por encima y por debajo de la urdimbre: se alterna cada 3 px
      const over = Math.floor((x + (even ? 0 : 1)) / 3) % 2 === 0;
      sink.set(x, y, even ? (over ? palette.light : palette.mid) : over ? palette.deep : palette.void1);
    }
    // El borde de la cortina brilla mientras se abre
    if (openHalf > 0 && openHalf < MOUTH_HALF) {
      for (const sx of [Math.floor(CX - openHalf - 0.5), Math.floor(CX + openHalf - 0.5)]) {
        if (insideMouth(sx, y)) sink.set(sx, y, palette.glow);
      }
    }
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function draw(sink: PixelSink, f: FxFrame): void {
  if (f.reduced) {
    // Quieto: portal abierto; la opacidad hace el fundido (ver `opacity`).
    paintVoid(sink, f, MOUTH_HALF);
    paintPool(sink, f, 1);
    for (const p of framePixels(f, -1, true)) sink.set(p.x, p.y, p.color);
    return;
  }

  const flow = (f.time / 1000) * 6;
  const lit = Math.floor(f.time / 250) % 2 === 0;
  const arch = () => {
    for (const p of framePixels(f, flow, lit)) sink.set(p.x, p.y, p.color);
  };

  switch (f.phase) {
    case 'appear': {
      // Primero se enciende la clave; después las hebras bajan de ella hacia los dos pies.
      const reach = 0.04 + easeOut(Math.max(0, (f.t - 0.15) / 0.85)) * 0.46;
      if (f.t <= 0.05) return;
      for (const p of framePixels(f, -1, f.t > 0.6)) {
        const fromTop = Math.abs(p.s - 0.5);
        if (fromTop > reach) continue;
        // La punta de cada hebra va encendida
        const head = reach - fromTop < 0.035 && p.color !== f.palette.outline;
        sink.set(p.x, p.y, head ? f.palette.glow : p.color);
      }
      return;
    }
    case 'open': {
      // Primero se teje la trama de arriba abajo; luego se abre por el centro como una cortina.
      const weave = Math.min(1, f.t / 0.45);
      const part = f.t <= 0.45 ? 0 : easeOut((f.t - 0.45) / 0.55);
      const openHalf = part * MOUTH_HALF;
      if (openHalf > 0) paintVoid(sink, f, openHalf);
      paintWeft(sink, f, weave, openHalf);
      paintPool(sink, f, part);
      arch();
      return;
    }
    case 'hold': {
      paintVoid(sink, f, MOUTH_HALF);
      paintPool(sink, f, 1);
      arch();
      return;
    }
    case 'close': {
      // La cortina se cierra y la trama se deshace de abajo arriba.
      const shut = Math.min(1, f.t / 0.55);
      const openHalf = (1 - easeOut(shut)) * MOUTH_HALF;
      const unweave = f.t <= 0.55 ? 1 : 1 - (f.t - 0.55) / 0.45;
      if (openHalf > 0) paintVoid(sink, f, openHalf);
      paintWeft(sink, f, unweave, openHalf);
      paintPool(sink, f, openHalf / MOUTH_HALF);
      arch();
      return;
    }
    case 'vanish': {
      // Las hebras se sueltan del Nexo: cada píxel cae a su tiempo, chispea y se apaga.
      for (const p of framePixels(f, -1, false)) {
        const delay = hash(p.x, p.y, f.seed) * 0.45 + (1 - Math.abs(p.s - 0.5) * 2) * 0.1;
        const local = Math.max(0, Math.min(1, (f.t - delay) / 0.5));
        if (local <= 0) {
          sink.set(p.x, p.y, p.color);
          continue;
        }
        if (hash(p.y, p.x, f.seed + 7) < local) continue;
        const dy = Math.floor(local * local * 18);
        const sparkle = local > 0.2 && local < 0.55 && p.color !== f.palette.outline;
        sink.set(p.x, p.y + dy, sparkle ? f.palette.glow : p.color);
      }
      return;
    }
  }
}

export const portalNexo: EffectDef = {
  id: 'portal-nexo',
  lore: 'Puerta de hebras del Nexo por la que el Pockai viaja al Santuario de un amigo (LORE §8).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: BOTTOM },
  points: { mouth: MOUTH },
  phases: [
    { name: 'appear', ms: 560 },
    { name: 'open', ms: 560 },
    { name: 'hold', ms: 'hold' },
    { name: 'close', ms: 420 },
    { name: 'vanish', ms: 620 },
  ],
  reducedPhases: [
    { name: 'appear', ms: 200 },
    { name: 'open', ms: 0 },
    { name: 'hold', ms: 'hold' },
    { name: 'close', ms: 0 },
    { name: 'vanish', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'appear') return f.t;
    if (f.phase === 'vanish') return 1 - f.t;
    return 1;
  },
};
