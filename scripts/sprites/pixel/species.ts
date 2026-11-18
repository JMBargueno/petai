/**
 * Especies en pixel art (GUIA_ARTISTICA §7.5): una geometría por especie y etapa, en px nativos de
 * la rejilla de 64×64 (suelo en la fila 60), en 3/4 mirando abajo a la derecha.
 *
 * Cada etapa es un dibujo con su propio plan corporal, no la anterior escalada:
 *   baby      un volumen, sin brazos ni cola, rasgo icónico en brote
 *   juvenile  un volumen con brazos y cola
 *   adult     dos volúmenes (cabeza y torso), rasgo completo, manchas
 *   final     dos volúmenes y piezas que rompen el contorno, franjas, emblema, ceja
 *
 * La pose (`Pose`, la misma de `poses.ts`) se aplica a la geometría antes de rasterizar.
 */
import type { Pose, Stage } from '../species';
import { drawFace, drawFx, EyeSpec } from './face';
import { FLOOR, Grid, hex, mul, N, rotateAt, scaleAt, translate } from './raster';

/** Elipse: [cx, cy, rx, ry]. */
type E = [number, number, number, number];
export type Slot = 'head' | 'face' | 'neck' | 'back';
export type Anchors = Record<Slot, [number, number]>;

export interface StageSpec {
  torso: E;
  /** Con cabeza aparte el plan corporal es de dos volúmenes. */
  head?: E;
  feet: { near: E; far: E };
  /** Pies y manos en tono de marca (etapa final). */
  boots?: boolean;
  arm?: E;
  farArm?: E;
  belly?: E;
  emblem?: E;
  cheek?: [number, number];
  marks?: { head?: E[]; torso?: E[] };
  eye: EyeSpec;
  brow?: boolean;
  /** Talla de accesorio de la etapa y anclas que no salen de la geometría. */
  size: 'S' | 'M' | 'L';
  neck: [number, number];
  back: [number, number];
}

/** Lo que una especie pinta además del cuerpo común: su rasgo icónico y sus piezas propias. */
interface Hooks {
  /** Detrás del cuerpo: cola, aletas, branquias lejanas. */
  behind?: (g: Grid, s: StageSpec, p: Pose) => void;
  /** Sobre la cabeza, después de pintarla: cuernos, hojas, crestas. */
  onHead?: (g: Grid, s: StageSpec, p: Pose) => void;
}

export interface PixelSpecies {
  id: string;
  stages: Record<Stage, StageSpec & Hooks>;
}

const q = (v: number, step: number) => Math.round(v / step) * step;
const headOf = (s: StageSpec): E => s.head ?? s.torso;

/** Giro y escala de apéndices (branquias, hojas, llama) alrededor de su base. */
const appendage = (g: Grid, p: Pose, x: number, y: number, fn: () => void) =>
  g.with(mul(rotateAt(q(p.appRot, 3), x, y), scaleAt(q(p.app, 0.05), q(p.app, 0.05), x, y)), fn);

/** Cola que gira desde su base con la pose. */
const tail = (g: Grid, p: Pose, x: number, y: number, fn: () => void) => g.with(rotateAt(q(-p.tail * 0.6, 3), x, y), fn);

// ───────────────────────── Geometría común ─────────────────────────

const BASE: Record<Stage, StageSpec> = {
  baby: {
    torso: [31.5, 48, 12.5, 10.5],
    feet: { near: [36, 58, 3.2, 2], far: [27, 57.5, 2.8, 1.8] },
    cheek: [26, 50],
    eye: { y: 43, h: 6, x1: 30, w1: 5, x2: 38, w2: 4, glint: 2, gap: 1 },
    size: 'S',
    neck: [32, 53.5],
    back: [22, 49],
  },
  juvenile: {
    torso: [31, 42, 14, 14.5],
    feet: { near: [36.5, 57.5, 4.5, 2.6], far: [25.5, 57, 3.8, 2.4] },
    arm: [44.5, 45, 2.8, 3.8],
    farArm: [19, 44.5, 2.6, 3.6],
    belly: [35, 48, 7.5, 6.5],
    eye: { y: 36, h: 5, x1: 30, w1: 4, x2: 39, w2: 3, glint: 1, gap: 1 },
    size: 'M',
    neck: [32, 47.5],
    back: [20, 42],
  },
  adult: {
    torso: [30, 46.5, 13.5, 10],
    head: [32, 28, 15, 12],
    feet: { near: [36.5, 57.5, 5.2, 2.8], far: [24.5, 57, 4.4, 2.6] },
    arm: [44, 45.5, 3, 4.3],
    farArm: [17.5, 44.5, 2.8, 4],
    belly: [34, 48, 8, 6.5],
    marks: { head: [[19.5, 27, 2.6, 1.6]], torso: [[19.5, 43.5, 2.6, 1.5], [18.5, 48.5, 2.8, 1.5]] },
    eye: { y: 25, h: 6, x1: 31, w1: 4, x2: 42, w2: 3, glint: 1, gap: 2 },
    size: 'L',
    neck: [32, 38.5],
    back: [18, 36],
  },
  final: {
    torso: [30, 45.5, 15, 11],
    head: [32.5, 24, 15.5, 12],
    feet: { near: [37, 57.5, 5.8, 2.9], far: [24, 57, 4.8, 2.6] },
    boots: true,
    arm: [45.5, 44, 3.3, 4.6],
    farArm: [16, 43, 3, 4.2],
    belly: [34.5, 47, 9.5, 7.5],
    emblem: [34.5, 46.5, 2.2, 2.2],
    marks: {
      head: [[20, 21.5, 3.4, 1.2], [19, 26.5, 3.6, 1.2]],
      torso: [[18.5, 43, 3.4, 1.2], [17.5, 47.5, 3.4, 1.2], [19, 52, 3, 1.2]],
    },
    brow: true,
    eye: { y: 22, h: 6, x1: 31, w1: 4, x2: 42, w2: 3, glint: 1, gap: 2 },
    size: 'L',
    neck: [32.5, 35.5],
    back: [18, 33],
  },
};

const stage = (st: Stage, patch: Partial<StageSpec> & Hooks = {}): StageSpec & Hooks => ({ ...BASE[st], ...patch });

/**
 * Como `stage`, pero con la cabeza `dy` px más baja: deja sitio a orejas, antenas o capuchas sin
 * pasarse de la altura máxima de la etapa. Con un solo volumen se aplasta el cuerpo; con dos, se
 * acorta el cuello.
 */
function lowered(st: Stage, dy: number, patch: Partial<StageSpec> & Hooks = {}): StageSpec & Hooks {
  const b = BASE[st];
  const down = (e: E): E => [e[0], e[1] + dy, e[2], e[3]];
  if (b.head) {
    return {
      ...b,
      head: down(b.head),
      eye: { ...b.eye, y: b.eye.y + dy },
      marks: { ...b.marks, head: (b.marks?.head ?? []).map(down) },
      neck: [b.neck[0], b.neck[1] + Math.round(dy / 2)],
      ...patch,
    };
  }
  const half = dy / 2;
  return { ...b, torso: [b.torso[0], b.torso[1] + half, b.torso[2], b.torso[3] - half], eye: { ...b.eye, y: b.eye.y + Math.round(half) }, ...patch };
}

// ───────────────────────── Ignisaurio (fuego) ─────────────────────────
// Rasgo icónico: la llama de la cola. Segundo rasgo: las púas del lomo.

/** Llama: gota apuntando hacia arriba, con núcleo claro. */
function flame(g: Grid, part: number, x: number, y: number, w: number, h: number): void {
  g.poly(part, 'trait', [[x - w / 2, y], [x - w * 0.42, y - h * 0.45], [x - w * 0.1, y - h * 0.6], [x + w * 0.05, y - h], [x + w * 0.5, y - h * 0.42], [x + w / 2, y]], { flat: true });
  g.ellipse(part, 'trait', x, y - h * 0.08, w / 2, h * 0.3, { flat: true });
  if (w >= 5) g.ellipse(part, 'belly', x + 0.3, y - h * 0.22, w * 0.22, h * 0.2, { flat: true, clip: part, keep: true, tone: 'shade' });
}

const spikes = (g: Grid, pts: [number, number, number][]) =>
  pts.forEach(([x, y, r]) => g.poly(11, 'mark', [[x + r, y - r * 0.6], [x - r * 1.3, y - r * 0.3], [x + r * 0.8, y + r]], { flat: true }));

const IGNISAUR: PixelSpecies = {
  id: 'ignisaur',
  stages: {
    baby: stage('baby', {
      // Sin cola: la llama es una chispa que le sale de la espalda.
      behind: (g, _s, p) => appendage(g, p, 20, 41, () => flame(g, 1, 19.5, 41.5, 4, 5)),
    }),
    juvenile: stage('juvenile', {
      behind: (g, _s, p) => {
        tail(g, p, 19, 50, () => {
          g.ellipse(1, 'body', 14.5, 50, 5.5, 4);
          appendage(g, p, 11, 47, () => flame(g, 12, 10.5, 47.5, 6, 8));
        });
        spikes(g, [[18.5, 34, 2.4], [17, 40.5, 2.4]]);
      },
    }),
    adult: stage('adult', {
      behind: (g, _s, p) => {
        tail(g, p, 18, 50, () => {
          g.ellipse(1, 'body', 12.5, 50, 7, 4.6);
          appendage(g, p, 8, 47, () => flame(g, 12, 7.5, 47.5, 8, 11));
        });
        spikes(g, [[18, 21.5, 2.6], [16.5, 28, 2.8], [16.5, 41, 2.6]]);
      },
      marks: { torso: BASE.adult.marks!.torso },
      onHead: (g) => {
        g.ellipse(5, 'mark', 23, 18.5, 2.6, 3, { flat: true });
        g.ellipse(3, 'mark', 41, 19, 2.3, 2.6, { flat: true });
      },
    }),
    final: stage('final', {
      behind: (g, _s, p) => {
        tail(g, p, 17, 49, () => {
          g.ellipse(1, 'body', 11.5, 49.5, 7.5, 5);
          appendage(g, p, 7, 46, () => flame(g, 12, 6.5, 46.5, 10, 15));
        });
        spikes(g, [[18, 17, 3], [16, 23.5, 3.2], [16, 30.5, 3], [14.5, 39.5, 3]]);
      },
      marks: { torso: BASE.final.marks!.torso },
      onHead: (g, _s, p) => {
        g.ellipse(5, 'mark', 22.5, 14.5, 3, 3.6, { flat: true });
        g.ellipse(3, 'mark', 42.5, 15, 2.6, 3.2, { flat: true });
        // Accesorio de etapa final: cresta de fuego.
        appendage(g, p, 32, 13, () => flame(g, 6, 32, 13.5, 6, 5.5));
      },
    }),
  },
};

// ───────────────────────── Axolunar (agua) ─────────────────────────
// Rasgo icónico: las branquias en estrella a los lados de la cabeza. Segundo rasgo: la cola de aleta.

/** Branquia: lóbulo alargado que sale de la cabeza con un ángulo (grados, 0 = hacia la izquierda). */
function gill(g: Grid, part: number, x: number, y: number, len: number, deg: number, tip = false): void {
  const r = (deg * Math.PI) / 180;
  const dx = -Math.cos(r);
  const dy = -Math.sin(r);
  g.ellipse(part, 'trait', x + (dx * len) / 2, y + (dy * len) / 2, len / 2 + 0.6, Math.max(1.3, len * 0.2), { flat: true, rot: deg });
  if (tip) g.ellipse(part, 'trait', x + dx * len, y + dy * len, 1.8, 1.8, { flat: true });
}

const AXO_HEAD: Record<'adult' | 'final', E> = { adult: [32, 28.5, 16, 11.5], final: [32.5, 24.5, 16.5, 11.5] };

const AXOLUNAR: PixelSpecies = {
  id: 'axolunar',
  stages: {
    baby: stage('baby', {
      torso: [31.5, 48.5, 13, 10],
      behind: (g, _s, p) => {
        appendage(g, p, 20, 46, () => gill(g, 5, 20.5, 45.5, 4, 20));
        appendage(g, p, 43, 45, () => gill(g, 3, 43.5, 45, 3, 160));
      },
    }),
    juvenile: stage('juvenile', {
      behind: (g, _s, p) => {
        tail(g, p, 19, 51, () => {
          g.ellipse(1, 'body', 14, 51.5, 6, 3.4);
          g.ellipse(1, 'trait', 10.5, 50, 3, 4.4, { flat: true, rot: 20 });
        });
        appendage(g, p, 18, 37, () => { gill(g, 5, 18.5, 35, 6, 35); gill(g, 5, 18, 39.5, 6, -5); });
        appendage(g, p, 44.5, 37, () => { gill(g, 3, 44, 35.5, 4.5, 145); gill(g, 3, 44.5, 39.5, 4.5, 185); });
      },
    }),
    adult: stage('adult', {
      head: AXO_HEAD.adult,
      marks: { head: [[21, 22.5, 1.6, 1.4], [25.5, 20, 1.3, 1.1]], torso: [[19.5, 44, 1.8, 1.4], [18.5, 49, 1.6, 1.3]] },
      behind: (g, _s, p) => {
        tail(g, p, 18, 51, () => {
          g.ellipse(1, 'body', 12, 51.5, 7.5, 3.8);
          g.ellipse(1, 'trait', 7, 49.5, 3.6, 5.6, { flat: true, rot: 20 });
        });
        appendage(g, p, 17, 28, () => { gill(g, 5, 18, 23.5, 7.5, 45); gill(g, 5, 16.5, 28.5, 8, 10); gill(g, 5, 18, 33.5, 7, -25); });
        appendage(g, p, 47.5, 28, () => { gill(g, 3, 46.5, 24, 5.5, 135); gill(g, 3, 47.5, 28.5, 6, 172); gill(g, 3, 46.5, 33, 5, 205); });
      },
    }),
    final: stage('final', {
      head: AXO_HEAD.final,
      marks: {
        head: [[21, 18.5, 1.8, 1.5], [25.5, 16, 1.4, 1.2], [19.5, 23.5, 1.4, 1.2]],
        torso: [[18.5, 43, 2, 1.5], [17.5, 48, 1.8, 1.4], [20, 52.5, 1.6, 1.2]],
      },
      behind: (g, _s, p) => {
        tail(g, p, 17, 50, () => {
          g.ellipse(1, 'body', 11, 50.5, 8, 4);
          g.ellipse(1, 'trait', 5.5, 48, 4, 7, { flat: true, rot: 20 });
          g.ellipse(9, 'trait', 12, 45.5, 5, 2.2, { flat: true, rot: -12 });
        });
        appendage(g, p, 17, 24, () => { gill(g, 5, 18.5, 19, 9.5, 48, true); gill(g, 5, 16.5, 24.5, 10.5, 12, true); gill(g, 5, 18, 30, 9, -22, true); });
        appendage(g, p, 48.5, 24, () => { gill(g, 3, 47.5, 19.5, 7, 132, true); gill(g, 3, 48.5, 24.5, 7.5, 170, true); gill(g, 3, 47.5, 29.5, 6.5, 205, true); });
      },
      onHead: (g, _s, p) =>
        // Accesorio de etapa final: media luna sobre la cabeza.
        appendage(g, p, 33, 12, () => {
          g.ellipse(6, 'trait', 32.5, 11, 4, 4, { flat: true });
          g.ellipse(6, 'trait', 34.6, 9.6, 3.3, 3.3, { clip: 6, erase: true });
        }),
    }),
  },
};

// ───────────────────────── Florabrote (planta) ─────────────────────────
// Rasgo icónico: las hojas de la cabeza. Segundo rasgo: el collar de pétalos.

const leaf = (g: Grid, part: number, x: number, y: number, len: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  g.ellipse(part, 'trait', x - (Math.cos(r) * len) / 2, y - (Math.sin(r) * len) / 2, len / 2 + 0.5, Math.max(1.5, len * 0.3), { rot: deg });
};

const collar = (g: Grid, pts: [number, number, number][]) => pts.forEach(([x, y, r]) => g.ellipse(13, 'trait', x, y, r, r * 0.8, { flat: true }));

const FLORABUD: PixelSpecies = {
  id: 'florabud',
  stages: {
    baby: stage('baby', {
      // Un capullo: el cuerpo acaba en punta y de ella sale una sola hoja.
      torso: [31.5, 49, 12, 9.5],
      onHead: (g, _s, p) => {
        g.poly(4, 'body', [[25.5, 42], [31, 35.5], [37, 42]], { keep: true });
        appendage(g, p, 31, 36.5, () => leaf(g, 5, 31, 36.5, 4, 25));
      },
    }),
    juvenile: stage('juvenile', {
      torso: [31, 42.5, 13, 14],
      behind: (g, _s, p) => tail(g, p, 19, 51, () => leaf(g, 1, 19, 51.5, 8, 15)),
      onHead: (g, _s, p) => appendage(g, p, 31, 29, () => { leaf(g, 5, 30, 30, 6.5, 40); leaf(g, 3, 32.5, 30, 5.5, 135); }),
    }),
    adult: stage('adult', {
      torso: [30, 47, 12.5, 9.5],
      marks: { torso: [[19.5, 45, 2.2, 1.3], [19, 50, 2.2, 1.3]] },
      behind: (g, _s, p) => tail(g, p, 18, 51, () => { leaf(g, 1, 18, 51, 10, 20); leaf(g, 9, 17, 47, 7, 50); }),
      onHead: (g, _s, p) => {
        collar(g, [[21, 39, 3.4], [27, 41, 3.6], [34, 41.5, 3.8], [41, 40.5, 3.4], [45.5, 38.5, 2.8]]);
        appendage(g, p, 32, 17, () => { leaf(g, 5, 31, 19.5, 6.5, 30); leaf(g, 3, 33.5, 19.5, 5.5, 145); });
      },
    }),
    final: stage('final', {
      torso: [30, 46.5, 14, 10.5],
      behind: (g, _s, p) => {
        tail(g, p, 17, 50, () => { leaf(g, 1, 17, 51, 12, 18); leaf(g, 9, 16, 46, 10, 48); leaf(g, 9, 17.5, 41.5, 7, 80); });
        // Accesorio de etapa final: corona de pétalos alrededor de la cabeza.
        appendage(g, p, 32.5, 14, () =>
          [[18.5, 18, 4], [23.5, 13.5, 4], [31, 11.5, 4.2], [39, 12.5, 4], [45, 16.5, 3.8]].forEach(([x, y, r]) => g.ellipse(6, 'trait', x, y, r, r, { flat: true })),
        );
      },
      onHead: (g, _s, p) => {
        collar(g, [[19.5, 36, 3.8], [26, 38.5, 4], [33.5, 39.5, 4.2], [41, 38.5, 3.8], [46.5, 36, 3.2]]);
        appendage(g, p, 32.5, 13, () => { leaf(g, 5, 31.5, 14, 6, 40); leaf(g, 3, 34, 14, 5, 135); });
      },
    }),
  },
};

// ───────────────────────── Livolt (eléctrico, raro) ─────────────────────────
// Rasgo icónico: las alas con la marca de corazón. Segundo rasgo: las antenas en zigzag.

/** Ala: lóbulo girado que sale de la espalda. `heart` le pinta la marca de corazón. */
function wing(g: Grid, part: number, x: number, y: number, rx: number, ry: number, deg: number, heart = false): void {
  g.ellipse(part, 'trait', x, y, rx, ry, { rot: deg });
  if (heart) {
    const r = Math.max(1.2, rx * 0.2);
    g.ellipse(part, 'mark', x - r * 0.8, y - r * 0.4, r, r, { flat: true, clip: part, keep: true });
    g.ellipse(part, 'mark', x + r * 0.8, y - r * 0.4, r, r, { flat: true, clip: part, keep: true });
    g.poly(part, 'mark', [[x - r * 1.8, y], [x + r * 1.8, y], [x, y + r * 2.2]], { flat: true, clip: part, keep: true });
  }
}

/** Antena recta con bolita, o en forma de rayo en la etapa final. */
function antenna(g: Grid, part: number, x: number, y: number, len: number, lean: number, bolt = false): void {
  if (bolt) {
    g.poly(part, 'mark', [[x - 1, y], [x + lean * 0.5 - 1.5, y - len * 0.5], [x + lean * 0.5 + 0.5, y - len * 0.5], [x + lean - 1, y - len], [x + lean + 2, y - len * 0.4], [x + lean * 0.5 + 1, y - len * 0.4], [x + 1.5, y]], { flat: true });
    return;
  }
  g.poly(part, 'mark', [[x - 0.9, y], [x + 0.9, y], [x + lean + 0.9, y - len], [x + lean - 0.9, y - len]], { flat: true });
  g.ellipse(part, 'trait', x + lean, y - len, 1.7, 1.7, { flat: true });
}

const LIVOLT: PixelSpecies = {
  id: 'livolt',
  stages: {
    baby: lowered('baby', 3, {
      behind: (g, _s, p) => {
        appendage(g, p, 20, 46, () => wing(g, 20, 17.5, 45, 4.5, 3.6, -20));
        appendage(g, p, 44, 46, () => wing(g, 21, 45.5, 45.5, 3.5, 3, 20));
      },
      onHead: (g, _s, p) => appendage(g, p, 31, 40, () => { antenna(g, 22, 28.5, 40, 3, -1); antenna(g, 23, 34.5, 40, 3, 1); }),
    }),
    juvenile: lowered('juvenile', 4, {
      behind: (g, _s, p) => {
        appendage(g, p, 18, 42, () => wing(g, 20, 12.5, 39, 8, 6, -25));
        appendage(g, p, 45, 42, () => wing(g, 21, 48.5, 40, 5, 5.5, 25));
      },
      onHead: (g, _s, p) => appendage(g, p, 31, 32, () => { antenna(g, 22, 27.5, 32.5, 5, -2); antenna(g, 23, 35, 32.5, 5, 2); }),
    }),
    adult: lowered('adult', 5, {
      belly: [34, 50, 7.5, 5],
      behind: (g, _s, p) => {
        appendage(g, p, 18, 40, () => { wing(g, 20, 11.5, 33.5, 9.5, 7.5, -28, true); wing(g, 24, 12.5, 45, 7, 5.5, 20); });
        appendage(g, p, 46, 40, () => { wing(g, 21, 50.5, 34.5, 6, 7, 28); wing(g, 25, 50, 45, 4.5, 4.5, -20); });
      },
      onHead: (g, _s, p) => {
        // Collar de pelusa en el cuello.
        g.ellipse(13, 'belly', 32, 44.5, 9.5, 3, { flat: true });
        appendage(g, p, 32, 22, () => { antenna(g, 22, 27, 22.5, 6, -3); antenna(g, 23, 37, 22.5, 6, 3); });
      },
    }),
    final: lowered('final', 5, {
      belly: [34.5, 50, 8.5, 5.5],
      emblem: [34.5, 50, 2, 2],
      behind: (g, _s, p) => {
        appendage(g, p, 18, 37, () => {
          wing(g, 20, 10.5, 27.5, 9.5, 8.5, -30, true);
          wing(g, 24, 10.5, 42.5, 8, 6, 22);
          // Colas de ala: la pieza nueva de la etapa final.
          g.poly(26, 'trait', [[6, 46], [11, 46.5], [5.5, 55]], { flat: true });
        });
        appendage(g, p, 47, 37, () => { wing(g, 21, 52.5, 29, 6.5, 8, 30); wing(g, 25, 53, 42, 5, 5, -22); g.poly(27, 'trait', [[52, 45.5], [56.5, 45], [57, 53]], { flat: true }); });
      },
      onHead: (g, _s, p) => {
        g.ellipse(13, 'belly', 32.5, 40.5, 10.5, 3.2, { flat: true });
        appendage(g, p, 32.5, 18, () => { antenna(g, 22, 27, 18.5, 9.5, -4, true); antenna(g, 23, 38, 18.5, 9.5, 2, true); });
      },
    }),
  },
};

// ───────────────────────── Inktopus (sombra, raro) ─────────────────────────
// Rasgo icónico: los tentáculos que gotean tinta. Segundo rasgo: el manto en punta, como una capucha.

/** Tentáculo: lóbulo que sale de la base del cuerpo, con la punta enroscada. */
function tentacle(g: Grid, part: number, x: number, y: number, len: number, deg: number, drip = false): void {
  const r = (deg * Math.PI) / 180;
  const ex = x + Math.cos(r) * len;
  const ey = y + Math.sin(r) * len;
  g.ellipse(part, 'body', (x + ex) / 2, (y + ey) / 2, len / 2 + 1, 2.3, { rot: deg });
  g.ellipse(part, 'body', ex, ey - 1.2, 2.2, 2.2);
  if (drip) g.ellipse(part + 40, 'mark', ex, ey + 3.2, 1.3, 1.9, { flat: true });
}

/** Punta del manto: convierte la cabeza redonda en capucha. */
const hood = (g: Grid, part: number, x: number, base: number, w: number, h: number) =>
  g.poly(part, 'body', [[x - w, base], [x - w * 0.35, base - h * 0.75], [x + 0.5, base - h], [x + w * 0.5, base - h * 0.7], [x + w, base]], { keep: true });

const INKTOPUS: PixelSpecies = {
  id: 'inktopus',
  stages: {
    baby: stage('baby', {
      feet: { near: [37, 58, 4, 1.9], far: [26.5, 57.8, 3.6, 1.8] },
      behind: (g) => { tentacle(g, 25, 21, 55, 4, 165); tentacle(g, 26, 43, 55.5, 3.5, 15); },
      onHead: (g) => hood(g, 4, 31, 41.5, 6, 6.5),
    }),
    juvenile: stage('juvenile', {
      arm: undefined,
      farArm: undefined,
      feet: { near: [37.5, 57.8, 5.5, 2.3], far: [25, 57.5, 4.8, 2.2] },
      behind: (g, _s, p) => {
        tail(g, p, 19, 53, () => tentacle(g, 25, 19.5, 53, 7.5, 170, true));
        tentacle(g, 26, 44, 53.5, 6, 12);
        tentacle(g, 27, 19, 48, 5.5, 200);
      },
      onHead: (g) => hood(g, 4, 31, 31.5, 7.5, 6.5),
    }),
    adult: stage('adult', {
      head: [32, 29, 14, 12.5],
      torso: [30.5, 48, 12, 8.5],
      arm: undefined,
      farArm: undefined,
      belly: [34, 50, 6.5, 4.5],
      feet: { near: [37.5, 57.8, 6, 2.4], far: [25, 57.5, 5.2, 2.3] },
      behind: (g, _s, p) => {
        tail(g, p, 19, 53, () => { tentacle(g, 25, 19, 53.5, 9.5, 172, true); tentacle(g, 27, 18.5, 48.5, 8, 205); });
        tentacle(g, 26, 43.5, 54, 8, 10, true);
        tentacle(g, 28, 44, 49, 6.5, -25);
      },
      onHead: (g) => hood(g, 10, 32, 20, 8.5, 5),
    }),
    final: stage('final', {
      head: [32.5, 26.5, 15, 13],
      torso: [30.5, 47.5, 13, 9],
      arm: undefined,
      farArm: undefined,
      belly: [34.5, 49.5, 7.5, 5],
      emblem: [34.5, 49.5, 1.8, 1.8],
      feet: { near: [38, 57.8, 6.5, 2.5], far: [24.5, 57.5, 5.6, 2.4] },
      behind: (g, _s, p) => {
        tail(g, p, 19, 53, () => {
          tentacle(g, 25, 18.5, 54, 11.5, 174, true);
          tentacle(g, 27, 18, 49, 10.5, 200, true);
          tentacle(g, 29, 19.5, 44, 8, 225);
        });
        tentacle(g, 26, 43.5, 54.5, 10, 8, true);
        tentacle(g, 28, 44.5, 49.5, 9, -20, true);
        tentacle(g, 30, 44, 44.5, 6.5, -45);
      },
      onHead: (g, _s, p) => {
        hood(g, 10, 32.5, 17, 9, 3.2);
        // Accesorio de etapa final: corona de gotas de tinta suspendidas.
        appendage(g, p, 32.5, 9, () => [[23.5, 14.5, 1.4], [32.5, 11.4, 1.7], [41.5, 14.5, 1.4]].forEach(([x, y, r]) => {
          g.ellipse(6, 'mark', x, y, r, r * 1.25, { flat: true });
          g.poly(6, 'mark', [[x - r * 0.8, y - r * 0.6], [x + r * 0.8, y - r * 0.6], [x, y - r * 2.3]], { flat: true });
        }));
      },
    }),
  },
};

// ───────────────────────── Solarejo (luz, raro) ─────────────────────────
// Rasgo icónico: las orejas largas con la punta encendida. Segundo rasgo: la cola de pompón luminoso.

/** Oreja: lóbulo del color del cuerpo con el interior claro y la punta encendida. */
function ear(g: Grid, part: number, x: number, y: number, len: number, deg: number, w = 2.6): void {
  const r = (deg * Math.PI) / 180;
  const cx = x - (Math.cos(r) * len) / 2;
  const cy = y - (Math.sin(r) * len) / 2;
  g.ellipse(part, 'body', cx, cy, len / 2 + 0.6, w, { rot: deg });
  g.ellipse(part, 'belly', cx, cy, len / 2 - 1.2, Math.max(0.9, w - 1.5), { rot: deg, flat: true, clip: part, keep: true });
  g.ellipse(part, 'trait', x - Math.cos(r) * (len - 1), y - Math.sin(r) * (len - 1), w * 0.8, w * 0.8, { flat: true, clip: part, keep: true });
}

const pompom = (g: Grid, x: number, y: number, r: number) => g.ellipse(1, 'trait', x, y, r, r);

const SOLAREJO: PixelSpecies = {
  id: 'solarejo',
  stages: {
    baby: lowered('baby', 4, {
      onHead: (g, _s, p) => appendage(g, p, 31, 42, () => { ear(g, 23, 27.5, 43, 5.5, 80, 2); ear(g, 24, 35, 43, 5, 100, 1.8); }),
    }),
    juvenile: lowered('juvenile', 6, {
      belly: [35, 50, 7, 5],
      behind: (g, _s, p) => tail(g, p, 19, 52, () => pompom(g, 16.5, 52, 3.4)),
      onHead: (g, _s, p) => appendage(g, p, 31, 35, () => { ear(g, 23, 26.5, 35.5, 10, 82, 2.4); ear(g, 24, 35.5, 35.5, 9, 98, 2.1); }),
    }),
    adult: lowered('adult', 7, {
      belly: [34, 51.5, 7, 4],
      behind: (g, _s, p) => tail(g, p, 18, 52, () => pompom(g, 14.5, 52, 4.3)),
      onHead: (g, _s, p) => appendage(g, p, 32, 25, () => { ear(g, 23, 26, 25.5, 10, 78, 2.8); ear(g, 24, 38, 25.5, 9, 104, 2.5); }),
    }),
    final: lowered('final', 7, {
      belly: [34.5, 51, 8, 4.5],
      emblem: [34.5, 51, 1.8, 1.8],
      behind: (g, _s, p) => {
        tail(g, p, 17, 51, () => { pompom(g, 13, 51.5, 5); pompom(g, 10, 46.5, 2.6); });
        // Accesorio de etapa final: rayos de sol detrás de la cabeza.
        appendage(g, p, 32.5, 30, () =>
          [[15.5, 31, 198], [16.5, 23.5, 215], [49.5, 23.5, 325], [50.5, 31, 342]].forEach(([x, y, deg]) => {
            const a = (deg * Math.PI) / 180;
            g.poly(6, 'trait', [[x - Math.sin(a) * 1.8, y + Math.cos(a) * 1.8], [x + Math.sin(a) * 1.8, y - Math.cos(a) * 1.8], [x + Math.cos(a) * 5, y + Math.sin(a) * 5]], { flat: true });
          }),
        );
      },
      onHead: (g, _s, p) => appendage(g, p, 32.5, 21, () => { ear(g, 23, 26, 21.5, 14.5, 76, 3); ear(g, 24, 39, 21.5, 13.5, 106, 2.7); }),
    }),
  },
};

export const PIXEL_SPECIES: PixelSpecies[] = [IGNISAUR, AXOLUNAR, FLORABUD, LIVOLT, INKTOPUS, SOLAREJO];

// ───────────────────────── Dibujo ─────────────────────────

export interface Drawn {
  grid: Grid;
  anchors: Anchors;
  /** Altura del dibujo en px nativos, sin contar efectos. */
  height: number;
}

/** Dibuja un frame: geometría de la etapa + pose + cara + efectos. */
export function drawPockai(sp: PixelSpecies, st: Stage, p: Pose): Drawn {
  // Una pose con salto, golpe o embestida puede sacar la criatura del frame. En ese caso se vuelve a
  // dibujar desplazada lo justo para que quepa entera, con 1 px de margen para el contorno.
  const first = drawOnce(sp, st, p, 0, 0);
  const [x0, y0, x1] = first.grid.extent;
  const sx = x0 < 1 ? Math.ceil(1 - x0) : x1 > N - 1 ? -Math.ceil(x1 - (N - 1)) : 0;
  const sy = y0 < 1 ? Math.ceil(1 - y0) : 0;
  return sx || sy ? drawOnce(sp, st, p, sx, sy) : first;
}

function drawOnce(sp: PixelSpecies, st: Stage, p: Pose, shiftX: number, shiftY: number): Drawn & { box: [number, number, number, number] } {
  const s = sp.stages[st];
  const g = new Grid();
  const two = !!s.head;
  const H = headOf(s);
  const sit = p.sit ? 2 : 0;

  // Efectos de fondo (halos): se pintan primero y sin transformar.
  p.fx.filter((f) => f.b).forEach((f) => drawFx(g, f));

  // La pose mueve toda la criatura desde los pies. Todo se cuantiza a píxel entero.
  const body = mul(
    translate(Math.round(p.dx / 2) + shiftX, Math.round(p.dy / 2) + shiftY),
    mul(rotateAt(q(p.rot, 2), 32, FLOOR), scaleAt(q(p.sx, 0.025), q(p.sy, 0.025), 32, FLOOR)),
  );
  const foot = (e: E, phase: number): E => [e[0] + Math.round(phase * 2) + (p.sit ? 3 : 0), e[1] - Math.round(Math.max(0, phase) * 2) - (p.sit ? 1 : 0), e[2], e[3]];
  let anchors!: Anchors;
  let height = 0;
  let box: [number, number, number, number] = [0, 0, 0, 0];

  g.with(body, () => {
    const ell = (part: number, role: Parameters<Grid['ellipse']>[1], e: E, o: Parameters<Grid['ellipse']>[6] = {}) => g.ellipse(part, role, e[0], e[1], e[2], e[3], o);
    const upper = () => {
      s.behind?.(g, s, p);
      if (s.farArm && p.armL > 25) g.with(rotateAt(q(p.armL, 10), s.farArm[0] + 1, s.farArm[1] - s.farArm[3]), () => ell(14, 'skin', s.farArm!, { tone: 'shade' }));
    };
    // Sentado, el cuerpo baja 2 px y los pies se adelantan.
    g.with(translate(0, sit), upper);
    ell(2, s.boots ? 'mark' : 'skin', foot(s.feet.far, -p.leg), s.boots ? { flat: true } : { tone: 'shade' });
    g.with(translate(0, sit), () => {
      ell(4, 'body', s.torso, { hi: !two });
      if (s.belly) ell(4, 'belly', s.belly, { flat: true, clip: 4, keep: true });
      if (s.emblem) ell(4, 'mark', s.emblem, { flat: true, clip: 4, keep: true });
      (s.marks?.torso ?? []).forEach((m) => ell(4, 'mark', m, { flat: true, clip: 4, keep: true }));
      if (two) {
        ell(10, 'body', s.head!, { hi: true });
        (s.marks?.head ?? []).forEach((m) => ell(10, 'mark', m, { flat: true, clip: 10, keep: true }));
      }
      // Zona de cara sin patrón: envuelve ojos y boca.
      const e = s.eye;
      g.face(two ? 10 : 4, (e.x1 + e.x2 + e.w2) / 2, e.y + e.h / 2 + 1, (e.x2 + e.w2 - e.x1) / 2 + 3, e.h / 2 + 4);
      s.onHead?.(g, s, p);
    });
    ell(7, s.boots ? 'mark' : 'skin', foot(s.feet.near, p.leg), s.boots ? { flat: true } : {});
    g.with(translate(0, sit), () => {
      if (s.arm) {
        g.with(rotateAt(q(-p.armR, 10), s.arm[0] - 1, s.arm[1] - s.arm[3]), () => {
          ell(8, 'skin', s.arm!);
          if (s.boots) g.ellipse(8, 'mark', s.arm![0] + 0.5, s.arm![1] + s.arm![3] * 0.6, s.arm![2] * 0.8, s.arm![3] * 0.5, { flat: true, clip: 8, keep: true });
        });
      }
    });

    g.outline();
    box = g.bounds();
    height = FLOOR - box[1];

    g.with(translate(0, sit), () => {
      if (s.cheek) {
        const [cx, cy] = g.point(s.cheek[0], s.cheek[1]);
        g.rect(Math.round(cx), Math.round(cy), 2, 1, hex('#ff8fa3'));
      }
      const { face } = drawFace(g, s.eye, {
        eyes: p.eyes, mouth: p.mouth, look: p.look, blush: p.blush, tears: p.tears, food: p.food,
        brow: !!s.brow, browColor: hex('#1e1e1e'),
      });
      const r = (x: number, y: number) => g.point(x, y).map(Math.round) as [number, number];
      anchors = { head: r(H[0], H[1] - H[3]), face, neck: r(s.neck[0], s.neck[1]), back: r(s.back[0], s.back[1]) };
    });
  });

  p.fx.filter((f) => !f.b).forEach((f) => drawFx(g, f));
  return { grid: g, anchors, height, box };
}

/** Punto sobre la cabeza en el espacio de 128 px, para colocar efectos (`SpeciesArt.top`). */
export function topOf(sp: PixelSpecies, st: Stage): [number, number] {
  const H = headOf(sp.stages[st]);
  return [H[0] * 2, (H[1] - H[3]) * 2];
}

/**
 * Lo que `poses.ts` necesita de una especie para colocar efectos (punto sobre la cabeza y anclas de
 * la cara), en el espacio de 128 px. Sustituye al `SpeciesArt` vectorial ante las poses.
 */
export function poseArt(sp: PixelSpecies, st: Stage): { id: string; top: [number, number]; face: { l: [number, number]; r: [number, number]; er: number; mouth: [number, number] } } {
  const e = sp.stages[st].eye;
  const cy = (e.y + e.h / 2) * 2;
  return {
    id: sp.id,
    top: topOf(sp, st),
    face: { l: [(e.x1 + e.w1 / 2) * 2, cy], r: [(e.x2 + e.w2 / 2) * 2, cy], er: e.h, mouth: [(e.x1 + e.w1 + e.x2) * 1, (e.y + e.h + e.gap) * 2] },
  };
}

/** Ojos por talla de accesorio (S = baby, M = juvenile, L = adult y final): los usan las gafas. */
export const EYES_BY_SIZE: Record<'S' | 'M' | 'L', EyeSpec> = { S: BASE.baby.eye, M: BASE.juvenile.eye, L: BASE.adult.eye };
