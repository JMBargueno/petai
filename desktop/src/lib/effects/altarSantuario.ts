import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';

/**
 * Altar del Santuario: la puerta de casa (LORE §10, «Altar de Escritorio» / Santuario de Bolsillo).
 *
 * Distinto del portal del Nexo (que lleva fuera): un pórtico de piedra con dintel, sello y runas del
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
/** Arco de medio punto: centro en la línea de arranque, hueco de radio R_IN, dovelas hasta R_OUT. */
const SPRING = 27;
const R_IN = 10.5;
const R_OUT = 16.5;
const STEP_TOP = FEET - 3;
const PILLARS: Array<readonly [number, number]> = [
  [7, 13],
  [34, 40],
];

const dx = (x: number) => x + 0.5 - CX;
/** Dentro del hueco de la puerta (bajo el arco). */
function inOpening(x: number, y: number): boolean {
  if (y >= STEP_TOP) return false;
  if (y + 0.5 >= SPRING) return Math.abs(dx(x)) < R_IN;
  return Math.hypot(dx(x), y + 0.5 - SPRING) < R_IN;
}
/** Dentro del anillo de dovelas del arco. */
function inArchRing(x: number, y: number): boolean {
  if (y + 0.5 >= SPRING) return false;
  const r = Math.hypot(dx(x), y + 0.5 - SPRING);
  return r >= R_IN && r < R_OUT;
}

/** Dibuja el altar entero desplazado `dy` hacia abajo (lo que queda bajo el suelo no se ve). */
function paintAltar(c: Canvas2, f: FxFrame, dy: number, runes: number, open: number) {
  const { palette } = f;
  const put = (x: number, y: number, col: string) => {
    if (y + dy <= FEET && y + dy >= 0) c.set(x, y + dy, col);
  };
  // Hueco: la luz de casa, más viva junto al suelo y al centro (un hogar encendido al fondo)
  for (let y = 0; y < STEP_TOP; y++) {
    for (let x = 0; x < W; x++) {
      if (!inOpening(x, y)) continue;
      const r = Math.hypot(dx(x) * 1.3, y - (STEP_TOP - 6));
      put(x, y, r < 5 ? palette.glow : r < 11 ? palette.light : palette.mid);
    }
  }
  // Hojas de madera: cada una se pliega hacia su pilar al abrirse
  const leaf = Math.round(R_IN * (1 - open));
  for (let y = 0; y < STEP_TOP; y++) {
    for (let x = 0; x < W; x++) {
      if (!inOpening(x, y)) continue;
      const d = dx(x);
      const fromEdge = R_IN - Math.abs(d); // 0 junto al pilar … R_IN en el centro
      if (fromEdge > leaf) continue;
      const plank = Math.floor(fromEdge) % 4 === 3;
      const brace = (y === SPRING + 6 || y === STEP_TOP - 6) && fromEdge < leaf - 0.5;
      const knob = Math.abs(fromEdge - (leaf - 1.5)) < 0.5 && y === 44;
      const seam = Math.abs(d) < 0.6 && open === 0;
      put(x, y, knob ? palette.glow : seam || plank ? palette.outline : brace ? palette.mid : palette.deep);
    }
  }
  // Pilares de sillares con una runa por sillar, que se enciende de abajo arriba
  for (const [a, b] of PILLARS) {
    for (let y = SPRING - 2; y < STEP_TOP; y++) {
      const row = y - (SPRING - 2);
      for (let x = a; x <= b; x++) {
        const mortar = row % 7 === 6;
        put(x, y, mortar ? palette.outline : x === a ? palette.light : x === b ? palette.deep : palette.mid);
      }
      if (row % 7 === 2) {
        const fromBottom = 1 - (y - SPRING) / (STEP_TOP - SPRING);
        const lit = fromBottom <= runes;
        const rx = Math.floor((a + b) / 2);
        const glyph = [[0, 0], [0, 1], [0, 2], [-1, 1], [1, 1]];
        for (const [gx, gy] of glyph) put(rx + gx, y + gy, lit ? (gy === 1 ? palette.glow : palette.light) : palette.deep);
      }
    }
  }
  // Arco de dovelas, con juntas radiales cada ~20º
  for (let y = 0; y < SPRING; y++) {
    for (let x = 0; x < W; x++) {
      if (!inArchRing(x, y)) continue;
      const ang = Math.atan2(-(y + 0.5 - SPRING), dx(x)); // 0..π
      const joint = Math.abs(((ang / Math.PI) * 9) % 1 - 0.5) > 0.42;
      const r = Math.hypot(dx(x), y + 0.5 - SPRING);
      const outer = r > R_OUT - 1.2;
      put(x, y, joint ? palette.outline : outer ? palette.light : r < R_IN + 1 ? palette.deep : palette.mid);
    }
  }
  // Clave: el sello del Santuario, un rombo con su runa encima del arco
  const keyRows = [1, 2, 3, 3, 2, 1];
  keyRows.forEach((half, i) => {
    const y = SPRING - R_OUT - 3 + i;
    for (let x = CX - half; x < CX + half; x++) {
      const edge = x === CX - half || x === CX + half - 1;
      const core = (x === CX - 1 || x === CX) && (i === 2 || i === 3);
      put(x, y, core ? (runes >= 1 ? palette.glow : palette.light) : edge ? palette.light : palette.mid);
    }
  });
  // Escalón de piedra, más ancho que el pórtico
  for (let y = STEP_TOP; y <= FEET; y++) {
    for (let x = 4; x <= W - 5; x++) {
      const seam = (x + (y % 2) * 4) % 8 === 0 && y > STEP_TOP;
      put(x, y, y === STEP_TOP ? palette.light : seam ? palette.outline : y === FEET ? palette.deep : palette.mid);
    }
  }
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
  const c = new Canvas2(W, H);

  if (f.reduced) {
    paintAltar(c, f, 0, 1, 1);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'rise': {
      const dy = Math.round((1 - easeOut(f.t)) * (FEET - 4));
      paintAltar(c, f, dy, 0, 0);
      paintDust(c, f, f.t);
      break;
    }
    case 'runes':
      paintAltar(c, f, 0, easeOut(f.t), 0);
      break;
    case 'open':
      paintAltar(c, f, 0, 1, easeOut(f.t));
      break;
    case 'hold':
      paintAltar(c, f, 0, 1, 1);
      break;
    case 'close':
      paintAltar(c, f, 0, 1 - span(f.t, 0.5, 1), 1 - easeIn(f.t));
      break;
    case 'sink': {
      const dy = Math.round(easeIn(f.t) * (FEET - 4));
      paintAltar(c, f, dy, 0, 0);
      paintDust(c, f, f.t);
      break;
    }
  }
  c.flush(sink, f.palette.outline);
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
