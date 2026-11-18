import type { EffectDef, FxFrame, PixelSink } from './types';

/**
 * Portal de hebras del Nexo (LORE §8: «las visitas entre Santuarios viajan por las hebras del
 * Nexo»; §2: el Telar). Una clave en rombo —el nudo del Nexo, atado a la red por una hebra que
 * sube— se enciende, y de ella bajan tres hebras del Flujo del Pockai que se trenzan en un arco.
 * Dentro, una trama se teje y se abre como una cortina y deja ver el Éter; el Flujo se derrama en
 * un charco de luz a los pies. Al terminar, la trama se cierra y las hebras se deshilachan y caen.
 *
 * Rejilla nativa 44×66, ×2 en pantalla: los pies del arco (fila 63) quedan a la altura de los de
 * la mascota y las dos filas de debajo son el charco de luz.
 */

const W = 44;
const H = 66;
const CX = 22;
/** Línea de arranque del arco: por debajo, postes rectos; por encima, medio círculo. */
const SPRING_Y = 26;
const BOTTOM = 63;
/** Radios del marco: banda de hebras [R_IN, R_OUT), contorno a 1 px por cada lado. */
const R_IN = 14;
const R_OUT = 18;
const R_MID = 16;
const POST_LEN = BOTTOM - SPRING_Y;
const ARC_LEN = Math.PI * R_MID;
const TOTAL_LEN = POST_LEN * 2 + ARC_LEN;
/** Centro del vacío (boca del portal), donde entra la mascota. */
const MOUTH = { x: CX, y: 42 };
const STRANDS = 3;
const BRAID_PERIOD = 9;

/** Distancia «de arco»: a qué radio del marco cae el píxel (postes = distancia horizontal). */
function archDist(x: number, y: number): number {
  const dx = x + 0.5 - CX;
  const dy = y + 0.5 - SPRING_Y;
  return dy >= 0 ? Math.abs(dx) : Math.hypot(dx, dy);
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
  return (POST_LEN + (Math.PI - theta) * R_MID) / TOTAL_LEN;
}

function insideMouth(x: number, y: number): boolean {
  return archDist(x, y) < R_IN && y <= BOTTOM;
}

/** Hash entero estable → 0..1 (sin Math.random: el dibujo es determinista con la semilla). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Px = { x: number; y: number; color: string; s: number };

/** Píxeles del marco (hebras trenzadas + contorno), con su posición `s` a lo largo del arco. */
function framePixels(f: FxFrame, flow: number): Px[] {
  const { palette } = f;
  const out: Px[] = [];
  for (let y = 0; y <= BOTTOM; y++) {
    for (let x = 0; x < W; x++) {
      const d = archDist(x, y);
      if (d < R_IN - 1 || d >= R_OUT + 1) continue;
      const s = archS(x, y);
      if (d < R_IN || d >= R_OUT) {
        out.push({ x, y, color: palette.outline, s });
        continue;
      }
      // Trenza de tres hebras: cada una ondula a un lado y otro del centro de la banda.
      const r = d - R_MID; // -2..2
      const along = s * TOTAL_LEN;
      let best = Infinity;
      let depth = 0;
      for (let k = 0; k < STRANDS; k++) {
        const a = ((along + flow) / BRAID_PERIOD) * Math.PI * 2 + (k * Math.PI * 2) / STRANDS;
        const off = Math.sin(a) * 1.7;
        const dist = Math.abs(r - off);
        if (dist < best) {
          best = dist;
          depth = Math.cos(a);
        }
      }
      let color = palette.deep;
      if (best < 0.75) color = depth > 0.55 ? palette.light : depth > -0.3 ? palette.mid : palette.deep;
      if (best < 0.75 && depth > 0.93 && hash(x, y, f.seed) < 0.35) color = palette.glow;
      out.push({ x, y, color, s });
    }
  }
  return out;
}

/** Clave en rombo (nudo del Nexo): [fila, x inicial, x final]. */
const KEYSTONE: Array<[number, number, number]> = [
  [5, 21, 22],
  [6, 20, 23],
  [7, 19, 24],
  [8, 19, 24],
  [9, 20, 23],
  [10, 21, 22],
];
const inKey = (x: number, y: number) => KEYSTONE.some(([ky, a, b]) => ky === y && x >= a && x <= b);

/** La clave y la hebra que sube de ella hacia la red (filas 0..3). */
function ornamentPixels(f: FxFrame, lit: boolean): Px[] {
  const { palette } = f;
  const out: Px[] = [];
  for (let y = 4; y <= 11; y++) {
    for (let x = 18; x <= 25; x++) {
      if (inKey(x, y)) {
        const core = (y === 7 || y === 8) && (x === 21 || x === 22);
        const rim = !inKey(x - 1, y) || !inKey(x, y - 1);
        const color = core ? (lit ? palette.glow : palette.light) : rim ? palette.light : palette.mid;
        out.push({ x, y, color, s: 0.5 });
      } else if (inKey(x - 1, y) || inKey(x + 1, y) || inKey(x, y - 1) || inKey(x, y + 1)) {
        out.push({ x, y, color: palette.outline, s: 0.5 });
      }
    }
  }
  const wave = f.reduced ? 0 : Math.floor(f.time / 166) % 2;
  for (let y = 0; y <= 3; y++) {
    const x = 21 + ((y + wave) % 2);
    const color = y === 0 ? palette.mid : y === 3 ? palette.glow : palette.light;
    out.push({ x, y, color, s: 0.5 });
  }
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
  for (let y = 0; y <= BOTTOM; y++) {
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

/** La trama del telar: hilos horizontales que llenan la boca hasta la fracción `filled`. */
function paintWeft(sink: PixelSink, f: FxFrame, filled: number, openHalf: number) {
  const { palette } = f;
  const top = SPRING_Y - R_IN;
  for (let y = top; y <= BOTTOM; y++) {
    const fy = (y - top) / (BOTTOM - top);
    if (fy > filled) continue;
    for (let x = 0; x < W; x++) {
      if (!insideMouth(x, y)) continue;
      if (Math.abs(x + 0.5 - CX) <= openHalf) continue;
      const even = (y - top) % 2 === 0;
      // Cada hilo pasa por encima y por debajo de la urdimbre: se alterna cada 3 px
      const over = Math.floor((x + (even ? 0 : 1)) / 3) % 2 === 0;
      sink.set(x, y, even ? (over ? palette.light : palette.mid) : over ? palette.deep : palette.void1);
    }
    // El borde de la cortina brilla mientras se abre
    if (openHalf > 0 && openHalf < R_IN) {
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
    paintVoid(sink, f, R_IN);
    paintPool(sink, f, 1);
    for (const p of framePixels(f, 0)) sink.set(p.x, p.y, p.color);
    for (const p of ornamentPixels(f, true)) sink.set(p.x, p.y, p.color);
    return;
  }

  const flow = (f.time / 1000) * 6;
  const lit = Math.floor(f.time / 250) % 2 === 0;
  const frameAndKey = () => {
    for (const p of framePixels(f, flow)) sink.set(p.x, p.y, p.color);
    for (const p of ornamentPixels(f, lit)) sink.set(p.x, p.y, p.color);
  };

  switch (f.phase) {
    case 'appear': {
      // Primero se enciende la clave; después las hebras bajan de ella hacia los dos pies.
      if (f.t > 0.05) for (const p of ornamentPixels(f, f.t > 0.6)) sink.set(p.x, p.y, p.color);
      const reach = easeOut(Math.max(0, (f.t - 0.15) / 0.85)) * 0.5;
      for (const p of framePixels(f, flow)) {
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
      const openHalf = part * R_IN;
      if (openHalf > 0) paintVoid(sink, f, openHalf);
      paintWeft(sink, f, weave, openHalf);
      paintPool(sink, f, part);
      frameAndKey();
      return;
    }
    case 'hold': {
      paintVoid(sink, f, R_IN);
      paintPool(sink, f, 1);
      frameAndKey();
      return;
    }
    case 'close': {
      // La cortina se cierra y la trama se deshace de abajo arriba.
      const shut = Math.min(1, f.t / 0.55);
      const openHalf = (1 - easeOut(shut)) * R_IN;
      const unweave = f.t <= 0.55 ? 1 : 1 - (f.t - 0.55) / 0.45;
      if (openHalf > 0) paintVoid(sink, f, openHalf);
      paintWeft(sink, f, unweave, openHalf);
      paintPool(sink, f, openHalf / R_IN);
      frameAndKey();
      return;
    }
    case 'vanish': {
      // Las hebras se sueltan del Nexo: cada píxel cae a su tiempo, chispea y se apaga.
      for (const p of [...framePixels(f, flow), ...ornamentPixels(f, false)]) {
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
