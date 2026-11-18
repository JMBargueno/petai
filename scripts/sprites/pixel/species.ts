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
  /** Sin pies: la criatura flota o repta, y la especie pinta sus apoyos en los ganchos. */
  feet?: { near: E; far: E };
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
  /** Ancla `head` propia, si lo alto de la cabeza no es el sitio del gorro (ballena, cuadrúpedos). */
  hat?: [number, number];
}

/** Lo que una especie pinta además del cuerpo común: su rasgo icónico y sus piezas propias. */
interface Hooks {
  /** Detrás del cuerpo: cola, aletas, branquias lejanas. */
  behind?: (g: Grid, s: StageSpec, p: Pose) => void;
  /** Sobre la cabeza, después de pintarla: cuernos, hojas, crestas. */
  onHead?: (g: Grid, s: StageSpec, p: Pose) => void;
  /** Por delante de todo el cuerpo: patas cercanas de un cuadrúpedo, aletas, hocico. */
  front?: (g: Grid, s: StageSpec, p: Pose) => void;
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

/** Apoyo que da el paso con la pose: las patas que la geometría común no pinta (cuadrúpedos, nubes). */
const step = (p: Pose, e: E, phase: number): E => [e[0] + Math.round(phase * 2) + (p.sit ? 3 : 0), e[1] - Math.round(Math.max(0, phase) * 2) - (p.sit ? 1 : 0), e[2], e[3]];

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

// ───────────────────────── Magmadillo (fuego, super-raro) ─────────────────────────
// Plan corporal: CUADRÚPEDO bajo y largo. Rasgo icónico: la coraza de placas con grietas
// incandescentes. Segundo rasgo: las orejas en punta y la cola acorazada.

/** Coraza: franjas oscuras que separan las placas y, entre ellas, grietas que brillan. */
function plates(g: Grid, t: E, xs: number[], cracks: number[] = []): void {
  const [cx, cy, , ry] = t;
  // La panza queda sin acorazar.
  g.ellipse(4, 'belly', cx + 2, cy + ry + 1.5, t[2] * 0.75, ry * 0.5, { flat: true, clip: 4, keep: true, tone: 'shade' });
  xs.forEach((x) => {
    const lean = (x - cx) * 0.3;
    g.poly(4, 'mark', [[x - 0.9, cy - ry], [x + 0.9, cy - ry], [x + lean + 0.9, cy + ry * 0.55], [x + lean - 0.9, cy + ry * 0.55]], { flat: true, clip: 4, keep: true });
  });
  cracks.forEach((x, i) => {
    const y = cy - ry * (i % 2 ? 0.15 : 0.6);
    g.poly(4, 'belly', [[x - 1.2, y], [x + 0.4, y + 1.5], [x - 0.6, y + 3], [x + 1.1, y + 5.5], [x + 1.4, y + 3], [x + 2, y + 1.4], [x + 0.6, y]], { flat: true, clip: 4, keep: true });
  });
}

const pointEar = (g: Grid, part: number, x: number, y: number, w: number, h: number, lean = 0) =>
  g.poly(part, 'skin', [[x - w / 2, y], [x + lean, y - h], [x + w / 2, y]]);

/** Patas traseras de un cuadrúpedo: la lejana va detrás del cuerpo y la cercana, delante. */
function hindFar(g: Grid, p: Pose, e: E, dark = false): void {
  const f = step(p, e, p.leg);
  g.ellipse(2, dark ? 'mark' : 'skin', f[0], f[1], f[2], f[3], dark ? { flat: true } : { tone: 'shade' });
}
function hindNear(g: Grid, p: Pose, e: E, dark = false): void {
  const f = step(p, e, -p.leg);
  g.ellipse(16, dark ? 'mark' : 'skin', f[0], f[1], f[2], f[3], dark ? { flat: true } : {});
}

const QUAD = { arm: undefined, farArm: undefined, belly: undefined, emblem: undefined, marks: undefined };

const MAGMADILLO: PixelSpecies = {
  id: 'magmadillo',
  stages: {
    // Enroscado: una bola acorazada de la que solo asoman la cara y las orejas.
    baby: stage('baby', {
      torso: [31.5, 49, 12.5, 10],
      eye: { ...BASE.baby.eye, y: 45, x1: 32, x2: 40, style: 'lid' },
      cheek: [29, 52],
      behind: (g) => {
        pointEar(g, 22, 30, 41.5, 4, 4.5, -0.5);
        pointEar(g, 23, 39, 42, 3.6, 4, 0.5);
      },
      onHead: (g) => {
        g.ellipse(4, 'mark', 24, 46, 10, 11, { clip: 4, keep: true, within: [[0, 0], [29, 0], [27, 47], [31, 64], [0, 64]] });
        g.poly(4, 'belly', [[21.5, 43], [23, 45], [22, 47], [23.6, 50], [24.2, 47.2], [24.8, 45], [23.2, 43]], { flat: true, clip: 4, keep: true });
      },
    }),
    // Se desenrosca: cuatro patas, cabeza aparte y las primeras placas.
    juvenile: stage('juvenile', {
      ...QUAD,
      torso: [27, 46.5, 14, 10],
      head: [45, 45, 9.5, 8.5],
      feet: { near: [38.5, 57.6, 3.4, 2.5], far: [33, 57.2, 3, 2.3] },
      eye: { ...BASE.juvenile.eye, y: 41, x1: 41, x2: 50, style: 'lid' },
      neck: [39, 51],
      back: [22, 38],
      behind: (g, _s, p) => {
        tail(g, p, 14, 50, () => g.poly(1, 'skin', [[15, 46.5], [15.5, 52.5], [6, 54.5]]));
        hindFar(g, p, [18.5, 57.2, 3, 2.3]);
        pointEar(g, 22, 41, 39, 4, 6, -0.5);
        pointEar(g, 23, 49.5, 39, 3.6, 5.5, 0.8);
      },
      onHead: (g, s) => plates(g, s.torso, [21, 29]),
      front: (g, _s, p) => hindNear(g, p, [23.5, 57.6, 3.6, 2.5]),
    }),
    // Coraza alta de cuatro placas con grietas, placa en la frente y cola anillada.
    adult: stage('adult', {
      ...QUAD,
      torso: [26, 43.5, 17, 13],
      head: [46.5, 41.5, 10.5, 10],
      feet: { near: [40, 57.5, 4, 2.8], far: [34, 57, 3.6, 2.6] },
      eye: { ...BASE.adult.eye, y: 37, x1: 41, x2: 52, style: 'lid' },
      neck: [39, 49],
      back: [20, 32],
      behind: (g, _s, p) => {
        tail(g, p, 11, 48, () => {
          g.poly(1, 'skin', [[12, 43.5], [13, 51], [1.5, 54]]);
          [[9.5, 47.5], [6, 50]].forEach(([x, y]) => g.ellipse(1, 'mark', x, y, 0.9, 2.2, { flat: true, clip: 1, keep: true, rot: 15 }));
        });
        hindFar(g, p, [14.5, 57, 3.6, 2.6]);
        pointEar(g, 22, 42, 34, 5, 9, -1);
        pointEar(g, 23, 51.5, 34, 4.4, 8, 1.5);
      },
      onHead: (g, s) => {
        plates(g, s.torso, [15, 22, 29], [17.5, 24.5, 32]);
        g.ellipse(10, 'mark', 46, 32.5, 6, 2.6, { flat: true, clip: 10, keep: true });
      },
      front: (g, _s, p) => hindNear(g, p, [20, 57.5, 4.2, 2.8]),
    }),
    // Un pequeño volcán: chimeneas con llama en el lomo, cuerno en la frente y cola con ascua.
    final: stage('final', {
      ...QUAD,
      torso: [25.5, 42, 18.5, 14.5],
      head: [47, 39.5, 11, 10.5],
      feet: { near: [41, 57.5, 4.6, 2.9], far: [34.5, 57, 4, 2.6] },
      eye: { ...BASE.final.eye, y: 35, x1: 42, x2: 53, style: 'lid' },
      neck: [40, 48],
      back: [18, 30],
      behind: (g, _s, p) => {
        tail(g, p, 9, 47, () => {
          g.poly(1, 'skin', [[10.5, 42], [11.5, 50.5], [2, 50]]);
          appendage(g, p, 3, 48, () => flame(g, 12, 3.5, 48.5, 6, 8));
        });
        // Accesorio de etapa final: tres chimeneas encendidas, la central más alta.
        g.poly(15, 'mark', [[11, 34], [14.5, 25], [18, 25], [20, 32]]);
        g.poly(17, 'mark', [[20.5, 30], [24, 18.5], [29, 18.5], [32, 29]]);
        g.poly(18, 'mark', [[32, 31], [34.5, 23.5], [38, 23.5], [40, 33]]);
        appendage(g, p, 26.5, 19, () => flame(g, 6, 26.5, 19.5, 6, 8));
        appendage(g, p, 16, 25, () => flame(g, 19, 16.2, 25.5, 4, 4.5));
        appendage(g, p, 36, 24, () => flame(g, 20, 36.2, 24, 4, 4.5));
        hindFar(g, p, [13, 57, 4, 2.6], true);
        pointEar(g, 22, 42.5, 31, 5, 8, -1.5);
        pointEar(g, 23, 53, 31.5, 4.4, 7, 1.5);
      },
      onHead: (g, s) => {
        plates(g, s.torso, [13, 20, 27, 34], [15.5, 22.5, 29.5, 36]);
        g.ellipse(10, 'mark', 46.5, 30, 7, 2.8, { flat: true, clip: 10, keep: true });
        g.poly(21, 'mark', [[45, 30], [48, 22.5], [50.5, 30]], { flat: true });
      },
      front: (g, _s, p) => hindNear(g, p, [19, 57.5, 4.8, 2.9], true),
    }),
  },
};

// ───────────────────────── Nubeballena (agua, super-raro) ─────────────────────────
// Plan corporal: FLOTANTE sin patas ni apoyos: el cuerpo queda en el aire. Cuerpo de gota tumbada. Rasgo icónico: el chorro en forma de
// nube. Segundo rasgo: la cola de aleta doble y los puntos de luz del lomo.

/** Nube: tres lóbulos fundidos. */
function puff(g: Grid, part: number, x: number, y: number, r: number): void {
  g.ellipse(part, 'trait', x - r * 0.85, y + r * 0.25, r * 0.7, r * 0.65);
  g.ellipse(part, 'trait', x + r * 0.85, y + r * 0.3, r * 0.65, r * 0.6);
  g.ellipse(part, 'trait', x, y - r * 0.15, r, r * 0.9);
}

/** Cola de ballena: pedúnculo que sube desde el cuerpo y dos lóbulos abiertos en V. */
function fluke(g: Grid, part: number, x0: number, y0: number, x: number, y: number, s: number): void {
  g.poly(part, 'body', [[x0, y0 - 2.5], [x0, y0 + 3], [x - 0.5, y + 1.5], [x + 1.5, y - 1]]);
  g.ellipse(part, 'body', x - s * 0.55, y - s * 0.05, s * 0.75, s * 0.33, { rot: 25 });
  g.ellipse(part, 'body', x + s * 0.25, y - s * 0.6, s * 0.7, s * 0.33, { rot: -65 });
}

const dots = (g: Grid, pts: [number, number, number][]) => pts.forEach(([x, y, r]) => g.ellipse(4, 'belly', x, y, r, r, { flat: true, clip: 4, keep: true }));

/** Surcos de la garganta: rayas cortas sobre la panza. */
const grooves = (g: Grid, pts: [number, number, number][]) =>
  pts.forEach(([x, y, len]) => g.poly(4, 'belly', [[x, y], [x + len, y - 0.6], [x + len, y + 0.4], [x, y + 1]], { flat: true, clip: 4, keep: true, tone: 'shade' }));

/** Aleta pectoral: sale del costado y queda tendida hacia atrás, nunca bajo el cuerpo. Saluda con la pose. */
const flipper = (g: Grid, p: Pose, x: number, y: number, len: number, w: number) =>
  g.with(rotateAt(q(-p.armR * 0.6, 10), x, y), () => g.ellipse(8, 'skin', x - len * 0.42, y + len * 0.2, len / 2, w, { rot: -25 }));

const FLOAT = { head: undefined, feet: undefined, arm: undefined, farArm: undefined, marks: undefined };

const NUBEBALLENA: PixelSpecies = {
  id: 'nubeballena',
  stages: {
    // Una gota posada en el suelo, con un brote de aleta y una nubecita.
    baby: stage('baby', {
      ...FLOAT,
      torso: [32, 50, 14, 9.5],
      eye: { ...BASE.baby.eye, y: 46, x1: 32, x2: 41, style: 'bead' },
      cheek: [29, 54],
      hat: [34, 41],
      behind: (g, _s, p) => tail(g, p, 19, 52, () => g.ellipse(1, 'body', 17, 50, 3.6, 2.2, { rot: 30 })),
      onHead: (g, _s, p) => appendage(g, p, 26, 41, () => puff(g, 5, 26, 39, 2.2)),
    }),
    // Despega: queda en el aire, con aletas y cola de dos lóbulos.
    juvenile: stage('juvenile', {
      ...FLOAT,
      torso: [31, 44.5, 16, 10.5],
      belly: [35, 50, 11, 5.5],
      eye: { ...BASE.juvenile.eye, y: 41, x1: 32, x2: 42, style: 'bead' },
      hat: [34, 34.5],
      neck: [36, 52],
      back: [19, 39],
      behind: (g, _s, p) => {
        tail(g, p, 17, 45, () => fluke(g, 1, 17, 45, 11, 39, 5));
      },
      onHead: (g, _s, p) => {
        grooves(g, [[36, 51, 6], [37, 53, 5]]);
        appendage(g, p, 25, 34, () => puff(g, 5, 25, 31.5, 3));
      },
      front: (g, _s, p) => flipper(g, p, 30, 46, 7, 2),
    }),
    // Cuerpo grande con puntos de luz, chorro de nube sobre un tallo y cola alzada.
    adult: stage('adult', {
      ...FLOAT,
      torso: [31, 40.5, 19, 13],
      belly: [36, 47.5, 13.5, 6.5],
      eye: { ...BASE.adult.eye, y: 38, x1: 34, x2: 46, style: 'bead' },
      hat: [36, 28],
      neck: [38, 51],
      back: [16, 33],
      behind: (g, _s, p) => {
        tail(g, p, 14, 40, () => fluke(g, 1, 14, 40, 7, 30, 7));
      },
      onHead: (g, _s, p) => {
        dots(g, [[19, 34, 1.3], [24, 30.5, 1.1], [17, 40, 1.1], [28.5, 29, 0.9]]);
        grooves(g, [[37, 48, 8], [38, 50.5, 7], [39, 52.5, 5]]);
        appendage(g, p, 25, 28, () => {
          g.poly(5, 'trait', [[23.8, 28.5], [26.2, 28.5], [25.8, 24], [24.2, 24]], { flat: true });
          puff(g, 5, 25, 21, 4);
        });
      },
      front: (g, _s, p) => flipper(g, p, 30, 43, 10, 2.6),
    }),
    // Lleva el cielo encima: crin de nubes en el lomo, cola doble y un chorro alto con gotas.
    final: stage('final', {
      ...FLOAT,
      torso: [31, 39, 20.5, 13.5],
      belly: [36.5, 46.5, 15, 6.5],
      emblem: [33, 47, 2, 2],
      eye: { ...BASE.final.eye, y: 36, x1: 35, x2: 47, style: 'bead' },
      hat: [37, 26],
      neck: [39, 50.5],
      back: [15, 31],
      behind: (g, _s, p) => {
        tail(g, p, 13, 38, () => {
          fluke(g, 1, 13, 38, 6, 26, 8);
          fluke(g, 9, 12, 41, 4.5, 36, 5);
        });
        // Accesorio de etapa final: crin de nubes que asoma sobre el lomo.
        [[13.5, 31.5, 3.2], [18, 27, 3.6], [24, 24.5, 3.2], [45.5, 28.5, 2.6]].forEach(([x, y, r]) => g.ellipse(6, 'trait', x, y, r, r));
      },
      onHead: (g, _s, p) => {
        dots(g, [[19, 33.5, 1.4], [25, 29.5, 1.2], [16.5, 39.5, 1.2], [30, 28, 1], [22, 38.5, 0.9]]);
        g.ellipse(4, 'mark', 15.5, 44.5, 3.2, 1.1, { flat: true, clip: 4, keep: true });
        g.ellipse(4, 'mark', 17.5, 48.5, 3, 1.1, { flat: true, clip: 4, keep: true });
        grooves(g, [[40, 46.5, 9], [41, 49, 8], [42, 51, 6]]);
        appendage(g, p, 27, 25, () => {
          g.poly(5, 'trait', [[25.6, 26], [28.4, 26], [27.8, 17], [26.2, 17]], { flat: true });
          puff(g, 5, 27, 13, 5);
          g.ellipse(22, 'trait', 19, 15.5, 1.3, 1.8, { flat: true });
          g.ellipse(23, 'trait', 35.5, 16.5, 1.3, 1.8, { flat: true });
        });
      },
      front: (g, _s, p) => flipper(g, p, 30, 41.5, 13, 3),
    }),
  },
};

// ───────────────────────── Cactuerno (planta, super-raro) ─────────────────────────
// Plan corporal: COLUMNA de un solo volumen que crece en vertical, con brazos de cactus. Rasgo
// icónico: las púas, que dentan la silueta. Segundo rasgo: la flor, ladeada en lo alto.

/** Púas: triángulos que salen del cuerpo en un ángulo (grados, 0 = derecha, 90 = abajo). */
const thorns = (g: Grid, pts: [number, number, number][], len = 3) =>
  pts.forEach(([x, y, deg]) => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.poly(11, 'mark', [[x - s * 1.3, y + c * 1.3], [x + s * 1.3, y - c * 1.3], [x + c * len, y + s * len]], { flat: true });
  });

/** Brazo de cactus: sale hacia un lado y dobla hacia arriba. Con la pieza del tronco, se funde con él. */
function cactusArm(g: Grid, x: number, y: number, dir: 1 | -1, reach: number, up: number, w: number, bloom = 0): void {
  g.ellipse(4, 'body', x + (dir * reach) / 2, y, reach / 2 + w, w);
  g.ellipse(4, 'body', x + dir * reach, y - up / 2, w, up / 2 + w);
  if (bloom) g.ellipse(dir > 0 ? 25 : 24, 'trait', x + dir * reach, y - up - w, bloom, bloom * 0.9);
}

/** Flor: capullo cerrado o corola abierta de cuatro pétalos. */
function flower(g: Grid, x: number, y: number, r: number, open: boolean): void {
  if (!open) {
    g.ellipse(5, 'trait', x, y, r * 0.8, r);
    return;
  }
  [[-1, -0.25], [1, -0.25], [0, -1], [0, 0.45]].forEach(([dx, dy]) => g.ellipse(5, 'trait', x + dx * r * 0.75, y + dy * r * 0.75, r * 0.62, r * 0.62));
  g.ellipse(5, 'mark', x, y - r * 0.2, r * 0.38, r * 0.38, { flat: true, clip: 5, keep: true });
}

/** Hocico de erizo: un pico que sobresale por el lado de la cara, con la nariz oscura. */
const snoutBack = (g: Grid, x: number, y: number) => g.ellipse(4, 'body', x, y, 3, 2.1);
const snoutNose = (g: Grid, x: number, y: number) => g.ellipse(4, 'mark', x + 1.6, y - 0.2, 1.2, 1.2, { flat: true, clip: 4, keep: true });

const COLUMN = { head: undefined, arm: undefined, farArm: undefined, marks: undefined };

const CACTUERNO: PixelSpecies = {
  id: 'cactuerno',
  stages: {
    // Un cactus bola: ancho y bajo, con cuatro púas y un capullo.
    baby: stage('baby', {
      torso: [32, 50.5, 12, 8.5],
      feet: { near: [36, 58.2, 3, 1.8], far: [28, 57.8, 2.6, 1.6] },
      eye: { ...BASE.baby.eye, y: 46, x1: 30, x2: 38, style: 'grumpy' },
      cheek: [26, 53],
      neck: [32, 55],
      behind: (g, _s, p) => {
        thorns(g, [[21.5, 48, 195], [24, 44.5, 230], [40, 44, 310], [43, 47.5, 345]], 3.6);
        appendage(g, p, 30, 43, () => flower(g, 30, 41, 2.4, false));
      },
    }),
    // Se estira: tronco alto con costillas, un brazo y la flor a punto de abrir.
    juvenile: stage('juvenile', {
      ...COLUMN,
      torso: [32, 44.5, 11.5, 14],
      feet: { near: [36.5, 58, 3.8, 2.2], far: [27.5, 57.6, 3.2, 2] },
      belly: [35, 51, 6, 5.5],
      eye: { ...BASE.juvenile.eye, y: 37, x1: 29, x2: 38, style: 'grumpy' },
      neck: [32, 47],
      back: [21, 44],
      behind: (g, _s, p) => {
        cactusArm(g, 21.5, 47, -1, 4, 5, 2.4);
        thorns(g, [[21, 38, 200], [23.5, 33.5, 230], [41.5, 34, 315], [20.5, 53, 170], [20.5, 43, 185]], 4.2);
        snoutBack(g, 43, 45.5);
        appendage(g, p, 28, 31, () => flower(g, 28, 29.5, 2.8, false));
      },
      onHead: (g) => {
        snoutNose(g, 43, 45.5);
        g.ellipse(4, 'mark', 24.5, 45, 0.8, 8, { flat: true, clip: 4, keep: true });
      },
    }),
    // Saguaro: columna alta con dos brazos a distinta altura y la flor abierta.
    adult: stage('adult', {
      ...COLUMN,
      torso: [32, 40, 13, 19],
      feet: { near: [37, 58, 4.4, 2.3], far: [27, 57.6, 3.8, 2.1] },
      belly: [35, 49.5, 7, 7.5],
      eye: { ...BASE.adult.eye, y: 29, x1: 28, x2: 39, style: 'grumpy' },
      neck: [32, 40.5],
      back: [19, 38],
      behind: (g, _s, p) => {
        cactusArm(g, 20, 38, -1, 5, 8, 2.8);
        cactusArm(g, 44, 46, 1, 4.5, 6, 2.6);
        thorns(g, [[20, 29, 205], [23, 24, 235], [42, 24.5, 310], [19.5, 47, 180], [20.5, 53, 165], [19, 34, 190]], 4.6);
        snoutBack(g, 44.5, 38);
        appendage(g, p, 27, 22, () => flower(g, 27, 19.5, 3.4, true));
      },
      onHead: (g) => {
        snoutNose(g, 44.5, 38);
        g.ellipse(4, 'mark', 23.5, 42, 0.8, 12, { flat: true, clip: 4, keep: true });
        g.ellipse(4, 'mark', 27, 47, 0.7, 8, { flat: true, clip: 4, keep: true });
      },
    }),
    // Cactus centenario: tres brazos en flor, corona de pétalos y una crin de púas.
    final: stage('final', {
      ...COLUMN,
      torso: [32, 37.5, 14.5, 22],
      feet: { near: [37.5, 58, 5, 2.4], far: [26.5, 57.6, 4.2, 2.2] },
      belly: [35.5, 47.5, 8.5, 9],
      emblem: [35.5, 47, 2, 2],
      eye: { ...BASE.final.eye, y: 23, x1: 28, x2: 39, style: 'grumpy' },
      neck: [32, 34.5],
      back: [18, 34],
      behind: (g, _s, p) => {
        cactusArm(g, 18.5, 34, -1, 6, 10, 3, 2.2);
        cactusArm(g, 45.5, 41, 1, 5.5, 8, 2.8, 2);
        cactusArm(g, 19, 48, -1, 4, 3.5, 2.2);
        thorns(g, [[19, 24, 205], [22, 18.5, 235], [26.5, 15.5, 255], [42.5, 19, 310], [45.5, 25, 335], [18, 42, 185], [19.5, 54, 165], [17.5, 30, 195]], 5);
        snoutBack(g, 46, 33);
        // Accesorio de etapa final: flor grande en corona, ladeada para dejar sitio al gorro.
        appendage(g, p, 37, 16, () => flower(g, 37.5, 12.5, 4.2, true));
      },
      onHead: (g) => {
        snoutNose(g, 46, 33);
        g.ellipse(4, 'mark', 22.5, 38, 0.9, 15, { flat: true, clip: 4, keep: true });
        g.ellipse(4, 'mark', 26, 45, 0.8, 11, { flat: true, clip: 4, keep: true });
        g.ellipse(4, 'mark', 41.5, 44, 0.8, 9, { flat: true, clip: 4, keep: true });
      },
    }),
  },
};

// ───────────────────────── Fénixel (fuego, legendario) ─────────────────────────
// Plan corporal: AVE de cuello largo. Sin brazos: alas de llama que se abren. Pico, patas finas y
// plumas en punta. Rasgo icónico: las alas y la cola de plumas de fuego. Segundo rasgo: la cresta.

/** Pico: triángulo bajo los ojos, donde cae la boca. */
function beak(g: Grid, e: EyeSpec, size = 1): void {
  const mx = (e.x1 + e.w1 + e.x2) / 2 + 1;
  const my = e.y + e.h + e.gap;
  g.poly(30, 'belly', [[mx - 3 * size, my - 1.5], [mx + 3 * size, my - 1.5], [mx + 0.5, my + 3.5 * size]], { flat: true });
}

/** Abanico de mechones redondeados que sale de un punto (crines y colas). */
const plumes = (g: Grid, part: number, x: number, y: number, fan: [number, number][], tip = false) =>
  fan.forEach(([len, deg]) => gill(g, part, x, y, len, deg, tip));

/** Pluma de fuego: rombo alargado que acaba en punta (grados como `gill`: 0 = izquierda, 90 = arriba). */
function feather(g: Grid, part: number, x: number, y: number, len: number, deg: number, w = 2.2): void {
  const r = (deg * Math.PI) / 180;
  const dx = -Math.cos(r);
  const dy = -Math.sin(r);
  const nx = -dy;
  const ny = dx;
  const at = (t: number, k: number): [number, number] => [x + dx * len * t + nx * w * k, y + dy * len * t + ny * w * k];
  g.poly(part, 'trait', [at(0, 0.45), at(0.4, 1), at(0.75, 0.7), at(1, 0), at(0.75, -0.7), at(0.4, -1), at(0, -0.45)]);
}

/**
 * Ala, cola o cresta: abanico de plumas en punta. Cada pluma es una pieza, así que el contorno las
 * separa. `cover` tapa el arranque con plumón del color del cuerpo.
 */
function fan(g: Grid, part: number, x: number, y: number, feathers: [number, number][], w = 2.2, cover = 0): void {
  feathers.forEach(([len, deg], i) => feather(g, part * 10 + 200 + i, x, y, len, deg, w));
  if (cover) {
    const mid = feathers.reduce((acc, [, d]) => acc + d, 0) / feathers.length;
    const r = (mid * Math.PI) / 180;
    g.ellipse(part * 10 + 209, 'skin', x - Math.cos(r) * cover * 0.7, y - Math.sin(r) * cover * 0.7, cover, cover * 0.62, { rot: mid });
  }
}

/** Pata de ave: caña fina y garra oscura; da el paso con la pose. */
function talon(g: Grid, part: number, p: Pose, x: number, top: number, phase: number, far: boolean): void {
  const t = step(p, [x + 0.8, 58, 2.6, 1.5], phase);
  g.poly(part, 'belly', [[x - 0.9, top], [x + 0.9, top], [t[0] + 0.1, t[1]], [t[0] - 1.7, t[1]]], far ? { flat: true, tone: 'shade' } : { flat: true });
  g.ellipse(part, 'mark', t[0], t[1], t[2], t[3], { flat: true });
}

/** Cuello largo de fénix: se funde con el cuerpo (pieza 4) y sube hasta la cabeza. */
const longNeck = (g: Grid, x0: number, y0: number, x1: number, y1: number, w: number) =>
  g.poly(4, 'body', [[x0 - w, y0 - w * 0.4], [x0 + w * 0.9, y0 + w * 0.8], [x1 + w, y1 + w * 0.3], [x1 - w, y1 - w * 0.5]]);

const BIRD = { arm: undefined, farArm: undefined, marks: undefined, feet: undefined };

const FENIXEL: PixelSpecies = {
  id: 'fenixel',
  stages: {
    // Un ascua dentro del cascarón: solo asoman la cabeza, el pico y la primera llama.
    baby: stage('baby', {
      feet: undefined,
      torso: [31.5, 47.5, 11.5, 10.5],
      eye: { ...BASE.baby.eye, y: 41, style: 'almond' },
      cheek: [27, 47],
      onHead: (g, s, p) => {
        beak(g, s.eye, 0.8);
        appendage(g, p, 31.5, 38, () => fan(g, 5, 31.5, 38.5, [[5.5, 90], [4, 58], [4, 122]], 1.6));
      },
      front: (g) =>
        g.poly(31, 'belly', [[19.5, 51.5], [22.5, 48.5], [25.5, 51.5], [28.5, 48.5], [31.5, 51.5], [34.5, 48.5], [37.5, 51.5], [40.5, 48.5], [43.5, 51.5], [42.5, 56], [38, 59.5], [25, 59.5], [20.5, 56]]),
    }),
    // Volantón: cuerpo de gota sobre patas finas, alas ya alzadas y tres plumas de cola.
    juvenile: stage('juvenile', {
      ...BIRD,
      torso: [32, 42.5, 9, 10],
      belly: [34, 46, 5.5, 5.5],
      eye: { ...BASE.juvenile.eye, y: 37, x1: 30, x2: 38, w1: 3, h: 4, style: 'almond' },
      neck: [32.5, 47.5],
      back: [22, 42],
      behind: (g, _s, p) => {
        tail(g, p, 24, 48, () => fan(g, 12, 24, 48, [[13, 8], [12, -16], [10, 30]], 1.9));
        appendage(g, p, 24, 40, () => fan(g, 20, 24, 40, [[15, 66], [14, 44], [11, 22]], 2, 3));
        appendage(g, p, 40, 41, () => fan(g, 21, 40, 41, [[12, 118], [11, 142]], 1.9, 2.6));
        talon(g, 2, p, 29.5, 50.5, -p.leg, true);
      },
      onHead: (g, s, p) => {
        beak(g, s.eye, 0.9);
        appendage(g, p, 31, 33, () => fan(g, 5, 31, 33.5, [[8, 62], [6.5, 38], [6, 88]], 1.6));
      },
      front: (g, _s, p) => talon(g, 7, p, 34.5, 51, p.leg, false),
    }),
    // Fénix joven: cabeza pequeña sobre un cuello largo, alas a medio abrir y cola larga.
    adult: stage('adult', {
      ...BIRD,
      torso: [28, 44, 9.5, 7.5],
      head: [38, 27, 8, 7.5],
      belly: [30, 46.5, 6, 4.5],
      brow: true,
      eye: { ...BASE.adult.eye, y: 24, x1: 34, x2: 42, w1: 4, w2: 3, h: 5, style: 'almond' },
      neck: [35.5, 37],
      back: [19, 41],
      behind: (g, _s, p) => {
        tail(g, p, 20, 46, () => fan(g, 12, 20, 46, [[17, 10], [16, -12], [14, 30], [12, -32]], 2.1));
        appendage(g, p, 24, 41, () => fan(g, 20, 24, 41, [[21, 66], [20, 48], [17, 30], [13, 12]], 2.4, 4));
        appendage(g, p, 35, 42, () => fan(g, 21, 35, 42, [[17, 116], [16, 134], [13, 152]], 2.2, 3.2));
        longNeck(g, 31, 41, 37.5, 31, 3.4);
        talon(g, 2, p, 26, 50, -p.leg, true);
      },
      onHead: (g, s, p) => {
        beak(g, s.eye, 1.1);
        appendage(g, p, 35.5, 21, () => fan(g, 5, 35.5, 21.5, [[9, 42], [8, 20], [7, 66]], 1.7));
      },
      front: (g, _s, p) => talon(g, 7, p, 31, 50.5, p.leg, false),
    }),
    // Fénix: alas enormes de fuego sobre la cabeza, cola de cinco plumas y cresta en estela.
    final: stage('final', {
      ...BIRD,
      torso: [28.5, 43.5, 10, 8],
      head: [39, 22.5, 8.5, 8],
      belly: [30.5, 46, 6.5, 5],
      emblem: [30.5, 46, 1.8, 1.8],
      eye: { ...BASE.final.eye, y: 19, x1: 35, x2: 43, w1: 4, w2: 3, h: 5, style: 'almond' },
      neck: [36, 34],
      back: [19, 41],
      behind: (g, _s, p) => {
        tail(g, p, 20, 46, () => fan(g, 12, 20, 46, [[18, 12], [17, -8], [15, -26], [15, 32], [12, -42]], 2.3));
        // Accesorio de etapa final: las alas se abren del todo y arden.
        appendage(g, p, 24, 40, () => fan(g, 20, 24, 40, [[30, 80], [29, 65], [26, 50], [22, 35], [18, 20], [13, 5]], 2.7, 5));
        appendage(g, p, 36, 41, () => fan(g, 21, 36, 41, [[27, 100], [27, 115], [24, 130], [20, 145], [16, 160], [12, 175]], 2.5, 4.2));
        longNeck(g, 31.5, 40, 38.5, 27.5, 3.8);
        talon(g, 2, p, 26, 50, -p.leg, true);
      },
      onHead: (g, s, p) => {
        beak(g, s.eye, 1.2);
        appendage(g, p, 36, 16, () => fan(g, 5, 36, 16.5, [[12, 38], [11, 18], [9, 60], [7, 82]], 1.9));
      },
      front: (g, _s, p) => talon(g, 7, p, 31.5, 50.5, p.leg, false),
    }),
  },
};

// ───────────────────────── Cerbito (sombra, legendario) ─────────────────────────
// Plan corporal: CUADRÚPEDO SENTADO DE TRES CABEZAS: grupa en el suelo, patas delanteras rectas y
// tres cabezas en abanico. Solo la central lleva cara completa y accesorios; las laterales asoman
// detrás, con ojos que brillan. Rasgo icónico: las tres cabezas. Segundo rasgo: las tres colas de
// sombra y el collar de púas.

/** Oreja caída de cachorro: lóbulo oscuro que cuelga desde lo alto de la cabeza. */
const floppyEar = (g: Grid, part: number, x: number, y: number, len: number, w: number, deg: number) =>
  g.ellipse(part, 'mark', x, y + len / 2, w, len / 2, { rot: deg });

/** Oreja tiesa y en punta. */
const sharpEar = (g: Grid, part: number, x: number, y: number, w: number, h: number, lean = 0) =>
  g.poly(part, 'mark', [[x - w / 2, y], [x + lean, y - h], [x + w / 2, y]]);

/** Cola de sombra: jirón del color del cuerpo con la punta encendida (grados como `gill`). */
function shadowTail(g: Grid, part: number, x: number, y: number, len: number, deg: number, w: number): void {
  const r = (deg * Math.PI) / 180;
  const dx = -Math.cos(r);
  const dy = -Math.sin(r);
  g.ellipse(part, 'body', x + (dx * len) / 2, y + (dy * len) / 2, len / 2 + 1, w, { rot: deg });
  g.ellipse(part, 'trait', x + dx * len, y + dy * len, w * 1.15, w * 1.15);
}

/** Sentado: la pata delantera cercana y el muslo, por delante del cuerpo. */
function sitting(g: Grid, legX: number, legY: number, legH: number, hx: number, hy: number, hr: number): void {
  g.ellipse(17, 'skin', hx, hy, hr, hr * 0.8);
  g.ellipse(16, 'skin', legX, legY, 2.4, legH);
}

/**
 * Cabeza lateral: va detrás de la central, así que solo asoma su mitad de fuera. `awake` le abre
 * los ojos (dos rendijas que brillan); dormida lleva una raya. `side` es -1 a la izquierda y 1 a
 * la derecha.
 */
function sideHead(g: Grid, part: number, side: 1 | -1, x: number, y: number, rx: number, ry: number, awake: boolean, ears: number): void {
  if (ears) {
    sharpEar(g, part + 1, x - side * rx * 0.1, y - ry * 0.75, rx * 0.55, ears, -side * 0.5);
    sharpEar(g, part + 2, x + side * rx * 0.6, y - ry * 0.55, rx * 0.5, ears * 0.85, side * 1);
  }
  g.ellipse(part, 'body', x, y, rx, ry);
  const ex = x + side * rx * 0.42;
  const ey = y - ry * 0.05;
  const eye = (cx: number) =>
    awake
      ? g.poly(part, 'belly', [[cx - 1.3, ey - 1.1 + side * 0.5], [cx + 1.3, ey - 1.1 - side * 0.5], [cx + 1.3, ey + 1], [cx - 1.3, ey + 1]], { flat: true, clip: part, keep: true })
      : g.poly(part, 'mark', [[cx - 1.3, ey], [cx + 1.3, ey], [cx + 1.3, ey + 1], [cx - 1.3, ey + 1]], { flat: true, clip: part, keep: true });
  eye(ex - 1.9);
  eye(ex + 1.9);
  g.poly(part, 'mark', [[ex - 1.5, ey + ry * 0.45], [ex + 1.5, ey + ry * 0.45], [ex + 1.5, ey + ry * 0.45 + 1], [ex - 1.5, ey + ry * 0.45 + 1]], { flat: true, clip: part, keep: true });
}

/** Collar de púas sobre el cuello de la cabeza central. */
function spikedCollar(g: Grid, x0: number, x1: number, y: number, spikes: number): void {
  g.ellipse(13, 'mark', (x0 + x1) / 2, y, (x1 - x0) / 2, 1.6, { flat: true });
  for (let i = 0; i < spikes; i++) {
    const x = x0 + 2 + (i * (x1 - x0 - 4)) / Math.max(1, spikes - 1);
    g.poly(35, 'belly', [[x - 1.3, y + 0.6], [x + 1.3, y + 0.6], [x, y + 3.6]], { flat: true });
  }
}

/** Colmillos: dos puntas claras bajo la boca de la cabeza central. */
function fangs(g: Grid, e: EyeSpec): void {
  const mx = (e.x1 + e.w1 + e.x2) / 2 - 1;
  const my = e.y + e.h + e.gap + 1;
  [mx - 0.5, mx + 4.5].forEach((x) => g.poly(10, 'belly', [[x - 1, my], [x + 1, my], [x, my + 2.6]], { flat: true, clip: 10, keep: true }));
}

const DOG = { arm: undefined, farArm: undefined, marks: undefined };

const CERBITO: PixelSpecies = {
  id: 'cerbito',
  stages: {
    // Cachorro tumbado: la cabeza central despierta y dos bultos dormidos a los lados.
    baby: stage('baby', {
      torso: [31.5, 49.5, 12, 9],
      feet: { near: [38, 58.2, 3.2, 1.8], far: [30, 58, 2.8, 1.6] },
      eye: { ...BASE.baby.eye, y: 44, style: 'shine' },
      cheek: [27, 52],
      neck: [32, 55],
      behind: (g, _s, p) => {
        tail(g, p, 19, 53, () => g.ellipse(1, 'trait', 17, 52, 3, 2.4));
        sideHead(g, 36, -1, 21.5, 47, 5, 4.6, false, 0);
        sideHead(g, 39, 1, 42.5, 47.5, 4.6, 4.2, false, 0);
      },
      onHead: (g) => {
        floppyEar(g, 22, 24.5, 41.5, 6.5, 2.4, 15);
        floppyEar(g, 23, 39.5, 42, 6, 2.2, -15);
      },
    }),
    // Se sienta: las cabezas laterales ya han brotado, pero siguen dormidas. Dos colas.
    juvenile: stage('juvenile', {
      ...DOG,
      torso: [29.5, 48.5, 10.5, 9],
      head: [34, 36, 9.5, 8.5],
      feet: { near: [36, 57.8, 3.4, 2.2], far: [30, 57.5, 3, 2] },
      belly: [32, 50, 5.5, 5.5],
      eye: { ...BASE.juvenile.eye, y: 33, x1: 29, x2: 38, style: 'shine' },
      neck: [33, 44.5],
      back: [19, 45],
      behind: (g, _s, p) => {
        tail(g, p, 19, 52, () => { shadowTail(g, 25, 19, 52, 8, 28, 2); shadowTail(g, 26, 19, 53.5, 7, -2, 1.8); });
        sideHead(g, 36, -1, 23, 37.5, 6.5, 6, false, 2.5);
        sideHead(g, 39, 1, 44.5, 38, 6, 5.5, false, 2.5);
        sharpEar(g, 22, 28, 30, 4, 3.5, -0.5);
        sharpEar(g, 23, 40, 30, 3.6, 3.2, 0.5);
      },
      onHead: (g) => g.ellipse(13, 'mark', 33, 44.2, 6.5, 1.5, { flat: true }),
      front: (g) => sitting(g, 36, 52.5, 5, 24, 53.5, 5.5),
    }),
    // Guardián: las tres cabezas despiertas, tres colas, colmillos y collar de púas.
    adult: stage('adult', {
      ...DOG,
      torso: [28.5, 47.5, 12, 10],
      head: [34.5, 29.5, 11, 10],
      feet: { near: [36.5, 57.8, 3.8, 2.3], far: [30, 57.5, 3.4, 2.1] },
      belly: [31.5, 49.5, 6.5, 6.5],
      eye: { ...BASE.adult.eye, y: 26, x1: 30, x2: 41, style: 'fierce' },
      neck: [34, 40.5],
      back: [17, 43],
      behind: (g, _s, p) => {
        tail(g, p, 17, 51, () => { shadowTail(g, 25, 17, 50, 12, 50, 2.3); shadowTail(g, 26, 17, 52, 11, 20, 2.2); shadowTail(g, 27, 17, 54, 9, -8, 2); });
        sideHead(g, 36, -1, 21, 30.5, 8, 7.5, true, 4.5);
        sideHead(g, 39, 1, 48, 31, 7.5, 7, true, 4.2);
        sharpEar(g, 22, 27.5, 22.5, 5, 6, -1);
        sharpEar(g, 23, 41.5, 22.5, 4.6, 5.5, 1);
      },
      onHead: (g, s) => {
        g.ellipse(10, 'mark', 34.5, 21.5, 3.2, 1.6, { flat: true, clip: 10, keep: true });
        fangs(g, s.eye);
        spikedCollar(g, 26.5, 42.5, 40, 4);
      },
      front: (g) => sitting(g, 36.5, 52, 6, 22.5, 53, 6.5),
    }),
    // Guardián del umbral: tres cabezas grandes, lomo erizado, colas largas y la cadena rota.
    final: stage('final', {
      ...DOG,
      torso: [28.5, 46.5, 13.5, 11],
      head: [35, 27.5, 12, 10.5],
      feet: { near: [37, 57.8, 4.2, 2.4], far: [30, 57.5, 3.6, 2.2] },
      belly: [31.5, 49, 7.5, 7],
      emblem: [31.5, 50, 2, 2],
      eye: { ...BASE.final.eye, y: 24, x1: 30, x2: 41, style: 'fierce' },
      neck: [34.5, 39],
      back: [16, 42],
      behind: (g, _s, p) => {
        tail(g, p, 16, 50, () => { shadowTail(g, 25, 16, 48, 19, 62, 2.8); shadowTail(g, 26, 16, 51, 16, 30, 2.7); shadowTail(g, 27, 16, 54, 12, 4, 2.5); });
        // Accesorio de etapa final: lomo erizado, con púas de sombra entre las cabezas.
        appendage(g, p, 35, 22, () => {
          [[25, 21.5, -1.5], [22, 22.5, -2], [45, 21.5, 1.5], [48, 23, 2]].forEach(([x, y, lean], i) => sharpEar(g, 44 + i, x, y, 3, 5.5, lean));
        });
        sideHead(g, 36, -1, 20, 28.5, 9.5, 8.5, true, 6);
        sideHead(g, 39, 1, 50, 29.5, 9, 8, true, 5.5);
        sharpEar(g, 22, 28, 20, 5.5, 8, -1.5);
        sharpEar(g, 23, 42.5, 20, 5, 7.5, 1.5);
      },
      onHead: (g, s) => {
        g.ellipse(10, 'mark', 35, 19, 3.6, 1.7, { flat: true, clip: 10, keep: true });
        g.ellipse(10, 'mark', 35, 22, 2, 1.2, { flat: true, clip: 10, keep: true });
        fangs(g, s.eye);
        spikedCollar(g, 26, 44, 38.5, 5);
        [[35, 43], [35, 46.2]].forEach(([x, y]) => g.ellipse(13, 'belly', x, y, 1.6, 1.6, { flat: true }));
      },
      front: (g) => sitting(g, 37, 51.5, 6.5, 22, 52.5, 7.2),
    }),
  },
};

// ───────────────────────── Kirisol (luz, legendario) ─────────────────────────
// Plan corporal: CUADRÚPEDO ESBELTO de patas largas y cuello alto: el cuerpo queda lejos del
// suelo. Rasgo icónico: el cuerno de luz. Segundo rasgo: la crin y la cola, que dejan estela.

/** Pata larga y fina con casco; da el paso con la pose. */
function longLeg(g: Grid, part: number, p: Pose, x: number, top: number, phase: number, far: boolean, dark = false): void {
  const f = step(p, [x, 57.7, 2, 1.5], phase);
  g.poly(part, 'skin', [[x - 1.3, top], [x + 1.3, top], [f[0] + 1.2, f[1]], [f[0] - 1.2, f[1]]], far ? { tone: 'shade' } : {});
  g.ellipse(part, dark ? 'mark' : 'trait', f[0], f[1], f[2], f[3], { flat: true });
}

const horn = (g: Grid, x: number, y: number, len: number, lean = 0.5) =>
  g.poly(32, 'trait', [[x - 1.4, y], [x + 1.4, y], [x + lean, y - len]], { flat: true });

/** Hocico de potro: alarga la cabeza hacia abajo a la derecha, sin línea de separación. */
const muzzle = (g: Grid, h: E, k = 1) => g.ellipse(10, 'body', h[0] + h[2] * 0.42, h[1] + h[3] * 0.62, h[2] * 0.62 * k, h[3] * 0.6 * k, { keep: true });

const mane = (g: Grid, part: number, pts: [number, number, number, number][]) => pts.forEach(([x, y, rx, ry]) => g.ellipse(part, 'trait', x, y, rx, ry));

const FOAL = { feet: undefined, arm: undefined, farArm: undefined, belly: undefined, marks: undefined };

const KIRISOL: PixelSpecies = {
  id: 'kirisol',
  stages: {
    // Potrillo recién nacido: tumbado, con las patas recogidas y un botón de cuerno.
    baby: stage('baby', {
      torso: [29.5, 51, 12.5, 8],
      head: [36, 43.5, 8.5, 7.5],
      feet: { near: [38, 58.3, 3, 1.5], far: [31.5, 58.2, 2.6, 1.4] },
      eye: { ...BASE.baby.eye, y: 40, x1: 30, x2: 38, style: 'lash' },
      cheek: [28, 47],
      neck: [34, 51],
      back: [20, 48],
      behind: (g, _s, p) => {
        tail(g, p, 18, 51, () => g.ellipse(1, 'trait', 16.5, 50, 3, 2.2));
        pointEar(g, 22, 31, 38, 3, 3.5, -0.5);
        pointEar(g, 23, 40.5, 38, 2.6, 3, 0.5);
      },
      onHead: (g, _s, p) => appendage(g, p, 35.5, 37, () => horn(g, 35.5, 37, 3.5)),
    }),
    // Se pone en pie: patas largas que aún tiemblan, cuerpo pequeño y cuerno corto.
    juvenile: stage('juvenile', {
      ...FOAL,
      torso: [28, 44.5, 10.5, 6.5],
      head: [40.5, 35, 8.5, 7.5],
      eye: { ...BASE.juvenile.eye, y: 33, x1: 36, x2: 45, style: 'lash' },
      neck: [37, 44],
      back: [21, 39],
      behind: (g, _s, p) => {
        tail(g, p, 18, 43, () => gill(g, 12, 18, 43.5, 7, -40));
        longLeg(g, 2, p, 22, 48, p.leg, true);
        longLeg(g, 3, p, 33.5, 48, -p.leg, true);
        mane(g, 6, [[31.5, 32, 2.4, 3.6], [30.5, 37.5, 2.4, 3.2]]);
        pointEar(g, 22, 36.5, 29.5, 3, 4, -0.5);
        pointEar(g, 23, 45.5, 29.5, 2.6, 3.6, 0.5);
      },
      onHead: (g, s, p) => {
        muzzle(g, s.head!);
        appendage(g, p, 41, 28.5, () => horn(g, 41, 28.5, 3.5));
      },
      front: (g, _s, p) => {
        longLeg(g, 16, p, 24.5, 48.5, -p.leg, false);
        longLeg(g, 7, p, 36, 48.5, p.leg, false);
      },
    }),
    // Potro: cuello alto, crin que cae por él, cola larga y motas de luz en el flanco.
    adult: stage('adult', {
      ...FOAL,
      torso: [26.5, 42, 12.5, 7.5],
      head: [42, 26.5, 9, 8],
      eye: { ...BASE.adult.eye, y: 24, x1: 36, x2: 47, style: 'lash' },
      neck: [37, 39],
      back: [18, 35.5],
      behind: (g, _s, p) => {
        tail(g, p, 15, 41, () => plumes(g, 12, 15, 41, [[10, -32], [9, -58]]));
        longLeg(g, 2, p, 19.5, 47, p.leg, true);
        longLeg(g, 3, p, 33, 47, -p.leg, true);
        // Cuello: se funde con el cuerpo (misma pieza).
        g.poly(4, 'body', [[29, 39], [38, 45], [44, 33], [35.5, 28]]);
        mane(g, 6, [[32.5, 23.5, 2.8, 4.2], [30, 29.5, 2.8, 4.6], [28.5, 35.5, 2.6, 4]]);
        pointEar(g, 22, 37.5, 20.5, 3.2, 5, -0.8);
        pointEar(g, 23, 47.5, 20.5, 2.8, 4.5, 0.8);
      },
      onHead: (g, s, p) => {
        muzzle(g, s.head!);
        dots(g, [[21, 40, 1.2], [25, 43.5, 1], [18.5, 43.5, 0.9]]);
        appendage(g, p, 43, 19.5, () => horn(g, 43, 19.5, 5, 1));
      },
      front: (g, _s, p) => {
        longLeg(g, 16, p, 22, 47.5, -p.leg, false);
        longLeg(g, 7, p, 36, 47.5, p.leg, false);
      },
    }),
    // Unicornio del alba: cuerno largo, crin y cola en estela, cascos oscuros y estrella en el flanco.
    final: stage('final', {
      ...FOAL,
      torso: [26, 41.5, 13.5, 8],
      head: [42.5, 22.5, 9.5, 8.5],
      emblem: [24, 41.5, 2.2, 2.2],
      eye: { ...BASE.final.eye, y: 20, x1: 36, x2: 47, style: 'lash' },
      neck: [37, 36.5],
      back: [17, 34.5],
      behind: (g, _s, p) => {
        tail(g, p, 14, 40, () => plumes(g, 12, 14, 40, [[13, -20], [12, -45], [10, -68]], true));
        longLeg(g, 2, p, 18.5, 47, p.leg, true, true);
        longLeg(g, 3, p, 33, 47, -p.leg, true, true);
        g.poly(4, 'body', [[28, 38], [38.5, 45], [45, 30], [35.5, 24]]);
        // Accesorio de etapa final: la crin se alarga en una estela de luz.
        appendage(g, p, 31, 26, () => {
          mane(g, 6, [[33, 19, 3, 4.5], [30.5, 25.5, 3, 5], [28.5, 32.5, 2.8, 4.5]]);
          plumes(g, 6, 29.5, 24, [[12, -8], [10, -28]], true);
        });
        pointEar(g, 22, 38, 16, 3.4, 5.5, -0.8);
        pointEar(g, 23, 48.5, 16, 3, 5, 0.8);
      },
      onHead: (g, s, p) => {
        muzzle(g, s.head!);
        dots(g, [[19, 39, 1.1], [29.5, 44.5, 1], [17, 43.5, 0.9]]);
        appendage(g, p, 43.5, 15, () => horn(g, 43.5, 15, 8.5, 1.5));
      },
      front: (g, _s, p) => {
        longLeg(g, 16, p, 21.5, 47.5, -p.leg, false, true);
        longLeg(g, 7, p, 36.5, 47.5, p.leg, false, true);
      },
    }),
  },
};

// ───────────────────────── Míticos: técnica común ─────────────────────────
// Los míticos no se construyen con dos elipses: su cuerpo es una curva lisa (`tube`) con sombreado
// propio, vientre de placas y aletas a lo largo del lomo, y llevan brillos en color literal (perla,
// faroles, núcleo) que no dependen de la paleta.

type P3 = [number, number, number];

/** Puntos de una curva suave (Catmull-Rom) por los puntos de control [x, y, radio]. */
function samples(pts: P3[], stepPx = 1.1): P3[] {
  const out: P3[] = [];
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / stepPx));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

interface TubeOpts {
  /** Todo el tubo en sombra: tramos que pasan por detrás. */
  far?: boolean;
  /** Franja de vientre, desplazada [dx, dy] radios desde el eje. */
  belly?: [number, number];
  /** Papel y tono de la franja de vientre (por defecto, secundario plano). */
  bellyRole?: 'belly' | 'skin' | 'trait';
  bellyTone?: 'light' | 'hi' | 'base';
  /** Una placa cada `scutes` muestras. */
  scutes?: number;
}

/** Cuerpo curvo liso: base, sombra abajo a la derecha, luz arriba a la izquierda y vientre de placas. */
function tube(g: Grid, part: number, role: 'body' | 'skin' | 'trait', pts: P3[], o: TubeOpts = {}): void {
  const S = samples(pts);
  S.forEach(([x, y, r]) => g.ellipse(part, role, x, y, r, r, o.far ? { tone: 'shade' } : { flat: true }));
  if (o.far) return;
  S.forEach(([x, y, r]) => g.ellipse(part, role, x + r * 0.5, y + r * 0.62, r * 0.8, r * 0.8, { clip: part, keep: true, tone: 'shade' }));
  S.forEach(([x, y, r]) => { if (r >= 2.4) g.ellipse(part, role, x - r * 0.42, y - r * 0.52, r * 0.4, r * 0.4, { clip: part, keep: true, tone: 'light' }); });
  if (!o.belly) return;
  const [bx, by] = o.belly;
  const role2 = o.bellyRole ?? 'belly';
  const tone2 = o.bellyTone ?? 'base';
  S.forEach(([x, y, r]) => g.ellipse(part, role2, x + bx * r, y + by * r, r * 0.52, r * 0.52, { clip: part, keep: true, tone: tone2 }));
  if (!o.scutes) return;
  S.forEach(([x, y, r], i) => {
    if (i % o.scutes! !== 0 || i === 0 || i >= S.length - 1) return;
    const tx = S[i + 1][0] - S[i - 1][0];
    const ty = S[i + 1][1] - S[i - 1][1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    const cx = x + bx * r;
    const cy = y + by * r;
    const h = r * 0.62;
    g.poly(part, role2, [[cx - nx * h, cy - ny * h], [cx + nx * h, cy + ny * h], [cx + nx * h + tx / l * 0.9, cy + ny * h + ty / l * 0.9], [cx - nx * h + tx / l * 0.9, cy - ny * h + ty / l * 0.9]], { clip: part, keep: true, tone: 'shade' });
  });
}

/** Aletas o púas a lo largo de una curva, por el lado `side` (1 o -1), echadas hacia atrás. */
function ridge(g: Grid, part: number, pts: P3[], every: number, h: number, side: 1 | -1, from = 2): void {
  const S = samples(pts);
  S.forEach(([x, y, r], i) => {
    if (i < from || i >= S.length - 2 || (i - from) % every !== 0) return;
    const tx = S[i + 1][0] - S[i - 1][0];
    const ty = S[i + 1][1] - S[i - 1][1];
    const l = Math.hypot(tx, ty) || 1;
    const ux = tx / l;
    const uy = ty / l;
    const nx = -uy * side;
    const ny = ux * side;
    const b = r - 0.8;
    g.poly(part + (i % 7), 'trait', [[x - ux * 1.7 + nx * b, y - uy * 1.7 + ny * b], [x + ux * 1.7 + nx * b, y + uy * 1.7 + ny * b], [x - ux * 2.2 + nx * (r + h), y - uy * 2.2 + ny * (r + h)]]);
  });
}

/** Púa o cuerno recto y afilado (grados como `gill`: 0 = izquierda, 90 = arriba). */
function spike(g: Grid, part: number, role: 'trait' | 'mark' | 'skin', x: number, y: number, len: number, deg: number, w: number): void {
  const r = (deg * Math.PI) / 180;
  const dx = -Math.cos(r);
  const dy = -Math.sin(r);
  g.poly(part, role, [[x - dy * w, y + dx * w], [x + dy * w, y - dx * w], [x + dx * len, y + dy * len]]);
}

/** Cuerno curvo: dos tramos que se doblan hacia atrás. */
function curvedHorn(g: Grid, part: number, x: number, y: number, len: number, deg: number, bend: number, w: number): void {
  const r = (deg * Math.PI) / 180;
  const mx = x - Math.cos(r) * len * 0.55;
  const my = y - Math.sin(r) * len * 0.55;
  spike(g, part, 'trait', mx, my, len * 0.6, deg + bend, w * 0.75);
  g.poly(part, 'trait', [[x + Math.sin(r) * w, y - Math.cos(r) * w], [x - Math.sin(r) * w, y + Math.cos(r) * w], [mx - Math.sin(r) * w * 0.75, my + Math.cos(r) * w * 0.75], [mx + Math.sin(r) * w * 0.75, my - Math.cos(r) * w * 0.75]]);
}

/** Hocico: alarga la cabeza hacia delante y abajo, sin línea de separación. */
const snout = (g: Grid, h: E, k = 1) => g.ellipse(10, 'body', h[0] + h[2] * 0.62, h[1] + h[3] * 0.42, h[2] * 0.62 * k, h[3] * 0.56 * k, { keep: true });

/** Rampas literales: brillos que no pasan por la paleta de la mascota. */
const glowRamp = (line: string, shade: string, base: string, light: string) => ({ line: hex(line), shade: hex(shade), base: hex(base), light: hex(light), hi: hex('#ffffff') });
const PEARL = glowRamp('#3b4a7a', '#bcd3ee', '#eef6ff', '#ffffff');
const EMBER_GLOW = glowRamp('#7a4a12', '#f4b942', '#ffe08a', '#fff6cf');
const PULSE = glowRamp('#1c6f86', '#7de8f7', '#d6fbff', '#ffffff');

/** Punto de luz con su halo: núcleo literal sobre un cerco del secundario. */
function glow(g: Grid, part: number, x: number, y: number, r: number, ramp: ReturnType<typeof glowRamp>, clip?: number): void {
  const o = clip === undefined ? {} : { clip, keep: true };
  g.ellipse(part, 'belly', x, y, r, r, { flat: true, ...o });
  g.ellipse(part, 'belly', x - r * 0.1, y - r * 0.1, r * 0.62, r * 0.62, { ramp, tone: 'base', clip: clip ?? part, keep: true });
  g.ellipse(part, 'belly', x - r * 0.3, y - r * 0.3, Math.max(0.6, r * 0.28), Math.max(0.6, r * 0.28), { ramp, tone: 'hi', clip: clip ?? part, keep: true });
}

/** Los míticos esconden el `torso` de la geometría común bajo otra pieza: su cuerpo es la curva. */
const hidden = (x: number, y: number): E => [x, y, 2.5, 2.5];

// ───────────────────────── Leviatín (agua, mítico) ─────────────────────────
// Plan corporal: SERPENTINO. Sin patas ni brazos: un cuerpo de anillos con vientre de placas que se
// enrosca en el suelo, se alza en un cuello en S y acaba en una cola levantada. Cabeza de dragón
// marino, con hocico, cuernos y bigotes. Rasgo icónico: el cuerpo en S con su cresta de aletas.
// Segundo rasgo: la melena de velos, la perla de la frente y la cola de abanico.

const SERPENT = { feet: undefined, arm: undefined, farArm: undefined, belly: undefined, marks: undefined, emblem: undefined };

/** Mandíbula clara bajo el hocico, como el vientre: la cabeza se lee en dos tonos. */
const jaw = (g: Grid, h: E) => g.ellipse(10, 'belly', h[0] + h[2] * 0.45, h[1] + h[3] * 0.78, h[2] * 0.95, h[3] * 0.42, { flat: true, clip: 10, keep: true });

/** Bigote: hilo que cae desde el hocico. */
const whisker = (g: Grid, part: number, pts: [number, number][]) => {
  const back = [...pts].reverse().map(([x, y]) => [x + 1.2, y + 0.3] as [number, number]);
  g.poly(part, 'trait', [...pts, ...back], { flat: true });
};

const LEVIATIN: PixelSpecies = {
  id: 'leviatin',
  stages: {
    // Alevín: cabeza grande sobre un cuerpecito enroscado, con la punta de la cola en alto.
    baby: stage('baby', {
      ...SERPENT,
      torso: hidden(35.5, 51),
      head: [35.5, 51, 8.5, 7.5],
      eye: { ...BASE.baby.eye, y: 47, x1: 30, x2: 38, style: 'slit' },
      cheek: [27, 55],
      neck: [34, 57],
      back: [21, 53],
      behind: (g, _s, p) => {
        const body: P3[] = [[16.5, 45.5, 1.3], [15, 50, 2.1], [19, 54.6, 3.1], [27, 55.6, 3.7]];
        appendage(g, p, 16.5, 45, () => plumes(g, 12, 16.5, 45.5, [[3.5, 70], [3.5, 120]]));
        tube(g, 4, 'body', body, { belly: [0.1, 0.5], scutes: 3 });
        appendage(g, p, 28, 49, () => plumes(g, 5, 28, 49.5, [[3.6, 18]], true));
        appendage(g, p, 43.5, 50, () => plumes(g, 3, 43.5, 50, [[3, 164]], true));
      },
      onHead: (g) => glow(g, 10, 36, 45.6, 1.5, PEARL, 10),
    }),
    // Se alza: un anillo en el suelo y un cuello corto, con las primeras aletas y dos cuernecillos.
    juvenile: stage('juvenile', {
      ...SERPENT,
      torso: hidden(41.5, 36.5),
      head: [41.5, 36, 7, 6],
      eye: { y: 33, h: 5, x1: 39, w1: 3, x2: 45, w2: 2, glint: 1, gap: 1, style: 'slit' },
      neck: [39.5, 43.5],
      back: [20, 51],
      behind: (g, _s, p) => {
        const ground: P3[] = [[10, 45, 1.4], [11.5, 50, 2.2], [16, 54.4, 3.4], [25, 55.2, 4], [34, 54.4, 4.1]];
        const neck: P3[] = [[33, 54.6, 4.1], [38.5, 51, 4], [39.6, 45.5, 3.8], [39.2, 41, 3.6]];
        appendage(g, p, 10, 45, () => plumes(g, 12, 10, 45, [[5, 75], [5, 115]], true));
        ridge(g, 60, ground, 5, 2, -1, 6);
        tube(g, 4, 'body', ground, { belly: [0.05, 0.55], scutes: 3 });
        ridge(g, 70, neck, 4, 2, -1);
        tube(g, 41, 'body', neck, { belly: [0.5, 0.15], scutes: 3 });
        appendage(g, p, 36, 37.5, () => plumes(g, 5, 36, 37.5, [[5.5, 6], [4.5, -24]], true));
        spike(g, 22, 'trait', 39, 31.5, 3.6, 55, 1.2);
        spike(g, 23, 'trait', 42.6, 31, 3.2, 75, 1.1);
      },
      onHead: (g, s) => {
        snout(g, s.head!, 1);
        jaw(g, s.head!);
        glow(g, 10, 41.5, 32, 1.4, PEARL, 10);
      },
    }),
    // Serpiente marina: dos anillos, cuello en S con cresta, melena de velos, cuernos y bigotes.
    adult: stage('adult', {
      ...SERPENT,
      torso: hidden(46, 24.5),
      head: [46, 24, 7.6, 6],
      eye: { y: 21, h: 5, x1: 44, w1: 3, x2: 50, w2: 2, glint: 1, gap: 1, style: 'slit' },
      neck: [41, 30.5],
      back: [20, 50],
      behind: (g, _s, p) => {
        const tailc: P3[] = [[5, 32, 1.3], [9.5, 37, 2.2], [14, 44, 3.1], [12, 51.5, 3.9], [17, 54.8, 4.3]];
        const ground: P3[] = [[15, 54.6, 4.3], [23, 55, 4.6], [33, 54.6, 4.8], [40.5, 52, 4.8]];
        const neck: P3[] = [[39.5, 52.5, 4.8], [43.5, 47, 4.7], [42.5, 41.5, 4.5], [38.5, 37, 4.3], [38, 31.5, 4.1], [42, 27, 3.9]];
        appendage(g, p, 5, 32, () => plumes(g, 12, 5.5, 32, [[7.5, 62], [7.5, 92], [6, 122]], true));
        ridge(g, 60, tailc, 5, 2.2, -1, 4);
        tube(g, 42, 'body', tailc);
        tube(g, 4, 'body', ground, { belly: [0.05, 0.55], scutes: 3 });
        ridge(g, 70, neck, 5, 2.6, -1, 4);
        tube(g, 41, 'body', neck, { belly: [0.5, 0.2], scutes: 3 });
        appendage(g, p, 40.5, 26, () => plumes(g, 5, 40.5, 26, [[8.5, 12], [7.5, -16], [5.5, -42]], true));
        curvedHorn(g, 22, 43, 20.5, 6.5, 48, -22, 1.3);
        curvedHorn(g, 24, 46.6, 19.8, 5.8, 68, -22, 1.2);
      },
      onHead: (g, s) => {
        snout(g, s.head!, 1.12);
        jaw(g, s.head!);
        g.ellipse(10, 'mark', 45.5, 19.6, 4.5, 1.2, { flat: true, clip: 10, keep: true });
        glow(g, 10, 45.6, 19.8, 1.7, PEARL, 10);
      },
      front: (g) => whisker(g, 30, [[51.5, 27.5], [53, 31], [52, 34.5]]),
    }),
    // Leviatán: tres anillos, cuello alto en S, cresta completa, cuernos curvos, melena y corona.
    final: stage('final', {
      ...SERPENT,
      torso: hidden(45.5, 18),
      head: [45.5, 17.6, 8.4, 6.4],
      eye: { y: 14.5, h: 5, x1: 43.5, w1: 3, x2: 49.5, w2: 2, glint: 1, gap: 1, style: 'slit' },
      brow: true,
      neck: [40.5, 24.5],
      back: [21, 47],
      behind: (g, _s, p) => {
        const hump: P3[] = [[19, 51, 4], [23, 45.5, 4.4], [28.5, 43.5, 4.6], [33.5, 46.5, 4.4], [36, 51.5, 4]];
        const tailc: P3[] = [[4.5, 25, 1.4], [9.5, 31, 2.4], [14.5, 40, 3.4], [11.5, 49, 4.4], [16.5, 53.6, 4.8]];
        const ground: P3[] = [[14, 53.8, 4.8], [22, 54.2, 5.2], [33, 54, 5.4], [41, 51.4, 5.4]];
        const neck: P3[] = [[40, 51.6, 5.4], [44.5, 46.5, 5.3], [43.5, 40, 5.1], [37.5, 35, 4.9], [35.5, 28.5, 4.7], [39.5, 22.5, 4.5], [44, 19.5, 4.2]];
        appendage(g, p, 4.5, 25, () => plumes(g, 12, 5.5, 25, [[9.5, 60], [9.5, 86], [8.5, 112], [7, 138]], true));
        ridge(g, 80, hump, 4, 2.8, -1, 2);
        tube(g, 40, 'body', hump);
        ridge(g, 60, tailc, 5, 2.6, -1, 4);
        tube(g, 42, 'body', tailc, { belly: [0.5, 0.1] });
        tube(g, 4, 'body', ground, { belly: [0.05, 0.55], scutes: 3 });
        ridge(g, 70, neck, 5, 3, -1, 4);
        tube(g, 41, 'body', neck, { belly: [0.5, 0.2], scutes: 3 });
        // Accesorio de etapa final: melena de velos tras la cabeza y cuernos curvos sobre la perla.
        appendage(g, p, 39.5, 19.5, () => plumes(g, 5, 39.5, 19.5, [[11, 14], [10, -12], [8, -38], [6, -62]], true));
        curvedHorn(g, 22, 42.5, 13.8, 7.8, 40, -22, 1.5);
        curvedHorn(g, 24, 46.5, 13, 6.6, 62, -22, 1.4);
      },
      onHead: (g, s) => {
        snout(g, s.head!, 1.15);
        jaw(g, s.head!);
        g.ellipse(10, 'mark', 45, 12.8, 5, 1.3, { flat: true, clip: 10, keep: true });
        glow(g, 10, 45.2, 13, 2, PEARL, 10);
      },
      front: (g) => {
        whisker(g, 30, [[51.5, 21.5], [54, 25.5], [53, 30], [54.5, 33.5]]);
        whisker(g, 31, [[49, 22.5], [50, 27], [48.5, 30.5]]);
      },
    }),
  },
};

// ───────────────────────── Yggdrito (planta, mítico) ─────────────────────────
// Plan corporal: ÁRBOL. Tronco de corteza con la cara y una barba de musgo, copa de hojas por
// cabeza, ramas que la sostienen y raíces retorcidas por pies. Es la única especie cuyo cuerpo va
// en el color secundario (la corteza): el primario y el patrón son de la copa. Rasgo icónico: la
// copa por capas. Segundo rasgo: las raíces y los faroles.

/** Corteza: cubre el tronco entero con el secundario, con sus vetas. */
function bark(g: Grid, t: E, grooves: [number, number, number][] = []): void {
  g.ellipse(4, 'trait', t[0], t[1], t[2] + 1.5, t[3] + 1.5, { clip: 4, keep: true });
  grooves.forEach(([x, y, h]) => g.ellipse(4, 'trait', x, y, 0.7, h, { clip: 4, keep: true, tone: 'shade' }));
}

const greenLeaf = (g: Grid, part: number, x: number, y: number, len: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  g.ellipse(part, 'body', x - (Math.cos(r) * len) / 2, y - (Math.sin(r) * len) / 2, len / 2 + 0.5, Math.max(1.5, len * 0.32), { rot: deg });
};

/** Lóbulos de la copa (se funden con la cabeza) y sus capas: matas en luz arriba y en sombra abajo. */
function canopy(g: Grid, lobes: E[], light: E[], shade: E[], spark: [number, number][] = []): void {
  lobes.forEach(([x, y, rx, ry]) => g.ellipse(10, 'body', x, y, rx, ry, { keep: true, flat: true }));
  shade.forEach(([x, y, rx, ry]) => g.ellipse(10, 'body', x, y, rx, ry, { clip: 10, keep: true, tone: 'shade' }));
  light.forEach(([x, y, rx, ry]) => g.ellipse(10, 'body', x, y, rx, ry, { clip: 10, keep: true, tone: 'light' }));
  spark.forEach(([x, y]) => g.ellipse(10, 'body', x, y, 1.3, 0.9, { clip: 10, keep: true, tone: 'hi' }));
}

/** Farol de luz colgando de la copa. */
function lantern(g: Grid, part: number, x: number, y0: number, drop: number, r = 1.9): void {
  g.poly(part, 'mark', [[x - 0.5, y0], [x + 0.6, y0], [x + 0.6, y0 + drop], [x - 0.5, y0 + drop]], { flat: true });
  glow(g, part, x, y0 + drop + r * 0.8, r, EMBER_GLOW);
}

/** Barba de musgo bajo la boca. */
function beard(g: Grid, x: number, y: number, w: number, h: number): void {
  // Perilla: tres mechones que cuelgan, el central más largo.
  g.poly(34, 'body', [[x - w * 0.75, y + 1], [x + w * 0.75, y + 1], [x + w * 0.85, y + h * 0.5], [x + w * 0.35, y + h * 0.72], [x, y + h], [x - w * 0.35, y + h * 0.72], [x - w * 0.85, y + h * 0.5]]);
  g.ellipse(34, 'body', x, y + h * 0.55, w * 0.3, h * 0.36, { clip: 34, keep: true, tone: 'shade' });
  // Bigote: dos mechones que caen a los lados de la boca.
  g.ellipse(35, 'body', x - w * 0.95, y + 0.6, w * 0.62, 1.5, { rot: -24 });
  g.ellipse(36, 'body', x + w * 0.95, y + 0.6, w * 0.62, 1.5, { rot: 24 });
}

/** Cejas de corteza: dos salientes en sombra sobre los ojos. */
function brows(g: Grid, e: EyeSpec): void {
  g.poly(4, 'trait', [[e.x1 - 1.5, e.y - 2.6], [e.x1 + e.w1 + 0.5, e.y - 1.6], [e.x1 + e.w1 + 0.5, e.y - 0.6], [e.x1 - 1.5, e.y - 1.4]], { clip: 4, keep: true, tone: 'shade' });
  g.poly(4, 'trait', [[e.x2 - 0.5, e.y - 1.6], [e.x2 + e.w2 + 1.5, e.y - 2.6], [e.x2 + e.w2 + 1.5, e.y - 1.4], [e.x2 - 0.5, e.y - 0.6]], { clip: 4, keep: true, tone: 'shade' });
}

const TREE = { feet: undefined, arm: undefined, farArm: undefined, belly: undefined, marks: undefined, emblem: undefined };

const YGGDRITO: PixelSpecies = {
  id: 'yggdrito',
  stages: {
    // Semilla: una bellota con capuchón, dos hojitas recién brotadas y dos raicillas.
    baby: stage('baby', {
      ...TREE,
      torso: [32, 50, 10, 8.5],
      eye: { ...BASE.baby.eye, y: 46, x1: 27, x2: 35, style: 'ring' },
      cheek: [24, 53],
      neck: [32, 55],
      back: [23, 50],
      behind: (g, _s, p) => {
        tube(g, 60, 'trait', [[28, 56, 1.8], [25, 58, 1.4], [22, 58.2, 1]]);
        tube(g, 61, 'trait', [[36, 56.4, 1.8], [39, 58.2, 1.4], [42, 58.2, 1]]);
        appendage(g, p, 32, 42, () => {
          g.poly(5, 'trait', [[31.3, 42.5], [32.7, 42.5], [32.5, 38.5], [31.5, 38.5]], { flat: true });
          greenLeaf(g, 20, 32, 38.5, 5.5, 25);
          greenLeaf(g, 21, 32, 38.5, 5, 150);
        });
      },
      onHead: (g, s) => {
        bark(g, s.torso);
        // Capuchón de la bellota, con su trama.
        g.ellipse(4, 'mark', 32, 43.6, 9.4, 3.2, { flat: true, clip: 4, keep: true });
        [[27, 43.2], [32, 42.6], [37, 43.2]].forEach(([x, y]) => g.ellipse(4, 'mark', x, y, 1.2, 0.8, { clip: 4, keep: true, tone: 'shade' }));
      },
    }),
    // Plantón: un tronquito con una copa de dos capas, dos ramitas de una hoja y raíces cortas.
    juvenile: stage('juvenile', {
      ...TREE,
      torso: [32, 47, 8.5, 10],
      head: [32, 33, 11, 6.4],
      eye: { ...BASE.juvenile.eye, y: 43, x1: 26, x2: 35, style: 'ring' },
      neck: [32, 40],
      back: [23, 46],
      behind: (g) => {
        tube(g, 60, 'trait', [[27.5, 54, 2.2], [23, 57, 1.8], [18.5, 58, 1.1]]);
        tube(g, 61, 'trait', [[36.5, 54.4, 2.2], [41, 57.2, 1.8], [45.5, 58, 1.1]]);
        tube(g, 63, 'trait', [[25, 46, 1.6], [21.5, 43.5, 1.3]]);
        tube(g, 64, 'trait', [[39, 47, 1.6], [42.5, 44.5, 1.3]]);
        greenLeaf(g, 20, 21.5, 43, 5.5, 40);
        greenLeaf(g, 21, 42.5, 44, 5, 140);
      },
      onHead: (g, s) => {
        bark(g, s.torso, [[25.5, 50, 4]]);
        canopy(g, [[29.5, 29.4, 5.5, 3.4], [38, 30.6, 4.5, 3]], [[28, 29, 4, 2], [37, 31, 3, 1.6]], [[27, 37, 5, 1.8], [38, 37, 4, 1.6]], [[26.5, 28.2]]);
      },
    }),
    // Árbol joven: copa ancha por capas, ramas que la sostienen, barba corta y raíces abiertas.
    adult: stage('adult', {
      ...TREE,
      torso: [32, 46.5, 9, 10.5],
      head: [32, 26.5, 16, 8.6],
      eye: { ...BASE.adult.eye, y: 40, x1: 25, x2: 36, style: 'ring' },
      neck: [32, 36.5],
      back: [22, 45],
      behind: (g) => {
        g.poly(4, 'trait', [[24.5, 51], [39.5, 51], [42, 58.6], [22, 58.6]]);
        tube(g, 60, 'trait', [[26, 54.5, 2.6], [20.5, 57, 2.1], [14.5, 58, 1.4], [11, 57.4, 1]]);
        tube(g, 61, 'trait', [[38, 54.5, 2.6], [43.5, 57, 2.1], [49.5, 58, 1.4], [53, 57.4, 1]]);
        tube(g, 63, 'trait', [[24, 44.5, 2.1], [19, 41.5, 1.8], [16, 36.5, 1.5], [16, 32, 1.3]]);
        tube(g, 64, 'trait', [[40, 45.5, 2.1], [45, 42.5, 1.8], [48, 37.5, 1.5], [48, 33, 1.3]]);
        greenLeaf(g, 20, 18.5, 41.5, 5, 10);
        greenLeaf(g, 21, 45.5, 42.5, 4.6, 170);
      },
      onHead: (g, s) => {
        bark(g, s.torso, [[24.5, 48, 5], [39.5, 49, 5]]);
        canopy(
          g,
          [[25, 20.6, 6.5, 4.4], [39.5, 20.2, 6, 4], [18, 29, 5.5, 4.6], [46, 29.5, 5.2, 4.4], [26, 33.4, 5, 2.8], [38, 33.4, 5, 2.8]],
          [[24, 19.8, 4.6, 2.4], [39, 19.4, 4, 2], [31, 24.5, 5.5, 2.4], [18, 27, 3, 1.8], [45, 27.4, 2.8, 1.6]],
          [[25, 32, 6, 2.2], [39, 32, 6, 2.2], [47.5, 31.5, 3, 1.8], [16.5, 31, 2.8, 1.6]],
          [[22.5, 18.6], [37, 18.2], [29.5, 23.4]],
        );
        beard(g, 31.5, 51, 3.6, 5);
      },
    }),
    // Árbol del mundo: copa enorme por capas con faroles, cejas de corteza, barba larga y raíces retorcidas.
    final: stage('final', {
      ...TREE,
      torso: [32, 45.5, 9.5, 10.5],
      head: [32, 20.5, 20, 10],
      eye: { ...BASE.final.eye, y: 38.5, x1: 25, x2: 36, style: 'ring' },
      neck: [32, 34.5],
      back: [21, 44],
      behind: (g, _s, p) => {
        tube(g, 65, 'trait', [[29, 55, 2.2], [24, 56.4, 1.8], [19.5, 55.4, 1.2]], { far: true });
        tube(g, 66, 'trait', [[35, 55, 2.2], [40, 56.4, 1.8], [44.5, 55.4, 1.2]], { far: true });
        g.poly(4, 'trait', [[23.5, 50], [40.5, 50], [44, 58.6], [20, 58.6]]);
        tube(g, 60, 'trait', [[25.5, 54, 3], [19.5, 56.6, 2.5], [12.5, 57.8, 1.7], [7.5, 56.6, 1.2], [5, 57.8, 0.9]]);
        tube(g, 61, 'trait', [[38.5, 54, 3], [44.5, 56.6, 2.5], [51.5, 57.8, 1.7], [56.5, 56.6, 1.2], [59, 57.8, 0.9]]);
        tube(g, 63, 'trait', [[24, 43.5, 2.5], [18, 40, 2.2], [14, 34, 1.9], [13.5, 28, 1.6]]);
        tube(g, 64, 'trait', [[40, 44.5, 2.5], [46, 41, 2.2], [50, 35, 1.9], [50.5, 29, 1.6]]);
        greenLeaf(g, 20, 17.5, 40, 5.5, 5);
        greenLeaf(g, 21, 46.5, 41, 5, 175);
        // Accesorio de etapa final: faroles de luz colgando de la copa.
        appendage(g, p, 32, 30, () => {
          lantern(g, 30, 10.5, 28, 3.2, 2.1);
          lantern(g, 31, 53.5, 28.5, 2.6, 2);
          lantern(g, 32, 21, 31.5, 2, 1.7);
          lantern(g, 33, 43.5, 31.5, 2.4, 1.7);
        });
      },
      onHead: (g, s) => {
        bark(g, s.torso, [[24, 47, 6], [40, 48, 6], [36.5, 55, 2.6]]);
        canopy(
          g,
          [[22.5, 12.8, 8, 5.4], [41, 12.2, 7.5, 5], [13.5, 24.5, 6.5, 6], [50.5, 25, 6.2, 5.8], [22, 29.5, 6.5, 3.6], [32, 31, 6.5, 3.2], [42, 29.5, 6.5, 3.6]],
          [[21.5, 11.8, 6, 3], [40.5, 11.2, 5.4, 2.6], [31, 16.5, 7, 3], [13.5, 22, 4, 2.6], [49.5, 22.5, 3.8, 2.4], [38, 21.5, 4.6, 2]],
          [[22, 28.5, 7, 2.6], [41.5, 28.5, 7, 2.6], [51.5, 28, 3.6, 2.2], [12.5, 28, 3.2, 2], [31, 26, 5, 1.8]],
          [[19, 10.4], [38, 9.8], [28.5, 15], [12, 20.6]],
        );
        brows(g, s.eye);
        beard(g, 31.5, 49.5, 4.6, 8.6);
        // Runa encendida en el tronco.
        glow(g, 4, 40.5, 44, 1.5, EMBER_GLOW, 4);
      },
    }),
  },
};

// ───────────────────────── Primpulso (eléctrico, mítico) ─────────────────────────
// Plan corporal: DRAGÓN ERGUIDO, de terópodo: un cuerpo en S que va de la cola al cuello, sobre dos
// patas con garras, con bracitos, hocico y alas de membrana. Rasgo icónico: las alas de rayo.
// Segundo rasgo: los cuernos, el núcleo de pulso del pecho y la línea de latido.

/** Rayo: zigzag que sale de un punto (grados como `gill`: 0 = izquierda, 90 = arriba). */
function bolt(g: Grid, part: number, x: number, y: number, len: number, deg: number, w: number): void {
  const r = (deg * Math.PI) / 180;
  const dx = -Math.cos(r);
  const dy = -Math.sin(r);
  const nx = -dy;
  const ny = dx;
  const shape: [number, number][] = [[0, -0.55], [0.5, -0.95], [0.42, -0.1], [1, -0.3], [0.48, 0.75], [0.56, 0.05], [0, 0.55]];
  g.poly(part, 'trait', shape.map(([a, b]) => [x + dx * a * len + nx * b * w, y + dy * a * len + ny * b * w] as [number, number]), { flat: true });
}

/** Línea de latido: un electro de trazo fino (pico arriba, pico abajo) en color de pulso. */
function heartbeat(g: Grid, clip: number, x0: number, y: number, w: number, amp: number): void {
  const path: [number, number][] = [[0, 0], [0.3, 0], [0.45, -1], [0.62, 1], [0.74, 0], [1, 0]];
  const pts = path.map(([u, v]) => [x0 + u * w, y + v * amp] as [number, number]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const steep = Math.abs(by - ay) > Math.abs(bx - ax);
    const t = 0.6;
    g.poly(clip, 'belly', steep ? [[ax - t, ay], [ax + t, ay], [bx + t, by], [bx - t, by]] : [[ax, ay - t], [bx, by - t], [bx, by + t], [ax, ay + t]], { ramp: PULSE, tone: 'base', clip, keep: true });
  }
}

/**
 * Ala de dragón: membrana entre el hombro, el codo y las puntas de los dedos, festoneada entre
 * dedo y dedo, con los huesos por encima. `far` la pinta en sombra (el ala de detrás).
 */
function dragonWing(g: Grid, part: number, shoulder: [number, number], elbow: [number, number], tips: [number, number][], inner: [number, number], far = false): void {
  const web: [number, number][] = [shoulder, elbow];
  tips.forEach((t, i) => {
    web.push(t);
    const n = tips[i + 1] ?? inner;
    // Festón: el borde se mete hacia el codo entre dos puntas.
    web.push([(t[0] + n[0]) / 2 + (elbow[0] - (t[0] + n[0]) / 2) * 0.28, (t[1] + n[1]) / 2 + (elbow[1] - (t[1] + n[1]) / 2) * 0.28]);
  });
  web.push(inner);
  g.poly(part, 'trait', web, far ? { tone: 'shade' } : {});
  const bone = (a: [number, number], b: [number, number], w: number) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / l) * w;
    const ny = ((b[0] - a[0]) / l) * w;
    g.poly(part + 1, 'skin', [[a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny], [b[0] + nx * 0.4, b[1] + ny * 0.4], [b[0] - nx * 0.4, b[1] - ny * 0.4]], far ? { tone: 'shade' } : { flat: true });
  };
  bone(shoulder, elbow, 1.3);
  tips.forEach((t) => bone(elbow, t, 0.9));
}

/** Pata trasera: muslo, caña y garras; va por delante del cuerpo. */
function hindLeg(g: Grid, x: number, y: number, rx: number, ry: number, beat = true): void {
  g.ellipse(16, 'skin', x, y, rx, ry, { rot: -15 });
  g.ellipse(16, 'skin', x - rx * 0.25, y - ry * 0.45, rx * 0.5, ry * 0.3, { clip: 16, keep: true, tone: 'light' });
  if (beat) heartbeat(g, 16, x - rx * 0.9, y + ry * 0.1, rx * 1.8, ry * 0.5);
}

/** Núcleo de pulso en el pecho: un punto de luz con dos anillos. */
function pulseCore(g: Grid, clip: number, x: number, y: number, r: number): void {
  g.ellipse(clip, 'mark', x, y, r + 1.2, r + 1.2, { flat: true, clip, keep: true });
  glow(g, clip, x, y, r, PULSE, clip);
}

const DRAGON = { arm: undefined, farArm: undefined, marks: undefined, belly: undefined, emblem: undefined };

const PRIMPULSO: PixelSpecies = {
  id: 'primpulso',
  stages: {
    // Chispa: una bola con dos cuernecillos de rayo, un muñón de ala, una cola corta y el primer latido.
    baby: stage('baby', {
      torso: [32.5, 48.5, 11.5, 10],
      eye: { ...BASE.baby.eye, y: 44, x1: 31, x2: 39, style: 'spark' },
      cheek: [27, 51],
      behind: (g, _s, p) => {
        tail(g, p, 22, 51, () => {
          tube(g, 42, 'body', [[14.5, 49, 1.2], [17.5, 52.5, 2], [22, 52, 3]]);
          bolt(g, 12, 15, 49, 4.5, 40, 1.9);
        });
        appendage(g, p, 23, 44, () => dragonWing(g, 50, [24, 45], [20.5, 41], [[17, 36.5], [15.5, 42.5]], [20.5, 46]));
        appendage(g, p, 32, 40, () => { bolt(g, 22, 29, 40.5, 5, 104, 2); bolt(g, 23, 37, 40.5, 4.5, 78, 1.8); });
      },
      onHead: (g) => heartbeat(g, 4, 22, 52.5, 10, 2.6),
    }),
    // Cría: ya es un dragón pequeño, con el cuerpo en S, hocico, alas cortas y cola de contrapeso.
    juvenile: stage('juvenile', {
      ...DRAGON,
      torso: hidden(27, 52),
      head: [41, 36, 6.5, 5.6],
      feet: { near: [30.5, 57.8, 4, 2], far: [22, 57.4, 3.4, 1.8] },
      eye: { y: 33, h: 5, x1: 39, w1: 3, x2: 45, w2: 2, glint: 1, gap: 1, style: 'spark' },
      neck: [37.5, 40.5],
      back: [22, 46],
      behind: (g, _s, p) => {
        const body: P3[] = [[23, 52.5, 4.4], [27, 49.5, 5], [31.5, 45.5, 4.6], [35.5, 41, 3.6], [38.5, 38, 3.2]];
        tail(g, p, 23, 52.5, () => {
          bolt(g, 12, 9.5, 52, 5.5, 30, 2.1);
          tube(g, 42, 'body', [[9, 52, 1.2], [13.5, 55, 1.9], [18.5, 55.5, 2.8], [23, 52.5, 4]]);
        });
        appendage(g, p, 28, 45, () => dragonWing(g, 50, [28, 45.5], [24, 37.5], [[17, 31], [14, 39.5]], [21, 44]));
        ridge(g, 70, body, 5, 2, -1, 3);
        tube(g, 4, 'body', body, { belly: [0.5, 0.3], bellyRole: 'skin', bellyTone: 'light', scutes: 3 });
        appendage(g, p, 40.5, 31.5, () => { bolt(g, 22, 38.5, 32, 5.5, 50, 1.9); bolt(g, 23, 42, 31.5, 5, 70, 1.7); });
      },
      onHead: (g, s) => {
        snout(g, s.head!, 0.9);
      },
      front: (g) => hindLeg(g, 27, 52, 4, 4.8),
    }),
    // Dragón joven: cuello largo, cuernos echados atrás, ala de dos dedos y garras.
    adult: stage('adult', {
      ...DRAGON,
      torso: hidden(27, 50.5),
      head: [43.5, 26, 6.6, 5.4],
      feet: { near: [30.5, 57.6, 4.6, 2.2], far: [21.5, 57.2, 3.8, 2] },
      boots: true,
      brow: true,
      eye: { y: 23, h: 5, x1: 41.5, w1: 3, x2: 47.5, w2: 2, glint: 1, gap: 1, style: 'spark' },
      neck: [38.5, 32.5],
      back: [22, 44],
      behind: (g, _s, p) => {
        const body: P3[] = [[23, 51, 5], [26.5, 47.5, 5.8], [30.5, 43, 5.6], [34.5, 37.5, 4.2], [37.5, 32.5, 3.6], [41, 28.5, 3.4]];
        tail(g, p, 23, 51, () => {
          bolt(g, 12, 7.5, 50, 6, 32, 2.3);
          tube(g, 42, 'body', [[7, 50, 1.2], [11.5, 54, 2], [17.5, 54.5, 3], [23, 51, 4.6]], { belly: [0.1, 0.5], bellyRole: 'skin', bellyTone: 'light' });
        });
        appendage(g, p, 28, 40, () => dragonWing(g, 50, [28, 40.5], [22, 28], [[12, 16], [6, 27.5], [10, 35]], [19, 38.5]));
        ridge(g, 70, body, 5, 2.4, -1, 3);
        tube(g, 4, 'body', body, { belly: [0.5, 0.3], bellyRole: 'skin', bellyTone: 'light', scutes: 3 });
        tube(g, 8, 'skin', [[33.5, 44, 1.7], [37.5, 46.5, 1.4], [39.5, 45, 1.1]]);
        appendage(g, p, 42.5, 21, () => { bolt(g, 22, 40.5, 22.5, 8, 48, 2.2); bolt(g, 23, 44, 21.8, 7.5, 68, 2); });
      },
      onHead: (g, s) => {
        snout(g, s.head!);
        pulseCore(g, 4, 33.5, 43.5, 1.6);
      },
      front: (g) => hindLeg(g, 27, 50.5, 4.6, 5.8),
    }),
    // Dragón de pulso: dos alas de rayo desplegadas, cuernos altos, núcleo encendido y cola de hoja.
    final: stage('final', {
      ...DRAGON,
      torso: hidden(27, 50),
      head: [44.5, 20.5, 7, 5.6],
      feet: { near: [31, 57.6, 5, 2.2], far: [21, 57.2, 4.2, 2] },
      boots: true,
      brow: true,
      eye: { y: 17.5, h: 5, x1: 42.5, w1: 3, x2: 48.5, w2: 2, glint: 1, gap: 1, style: 'spark' },
      neck: [39.5, 27.5],
      back: [22, 43],
      behind: (g, _s, p) => {
        const body: P3[] = [[23, 50.5, 5.4], [27, 46.5, 6.2], [31.5, 41.5, 6], [35.5, 35, 4.4], [38.5, 28.5, 3.7], [42, 23.5, 3.5]];
        // Accesorio de etapa final: las dos alas de rayo, más altas que la cabeza.
        appendage(g, p, 34, 37, () => dragonWing(g, 54, [35, 39], [46.5, 35], [[59.5, 27], [61, 36], [56.5, 44]], [47, 43.5], true));
        tail(g, p, 23.5, 50.5, () => {
          bolt(g, 12, 8.5, 48, 6.5, 35, 2.5);
          bolt(g, 13, 8.5, 48, 5, -5, 2);
          tube(g, 42, 'body', [[8, 48, 1.2], [12, 53, 2], [18, 54, 3.2], [23.5, 50.5, 5]], { belly: [0.1, 0.5], bellyRole: 'skin', bellyTone: 'light' });
        });
        appendage(g, p, 29, 38, () => {
          dragonWing(g, 50, [29, 38], [22, 24], [[11.5, 8], [4, 19.5], [4.5, 33]], [17, 36.5]);
          bolt(g, 52, 21, 25, 11, 62, 1.4);
        });
        ridge(g, 70, body, 5, 3, -1, 3);
        tube(g, 4, 'body', body, { belly: [0.5, 0.3], bellyRole: 'skin', bellyTone: 'light', scutes: 3 });
        tube(g, 8, 'skin', [[34, 42.5, 1.9], [38.5, 45, 1.6], [41, 43.5, 1.2]]);
        appendage(g, p, 43, 15.5, () => { bolt(g, 22, 41, 17, 11, 48, 2.5); bolt(g, 23, 45, 16, 10, 68, 2.3); });
      },
      onHead: (g, s) => {
        snout(g, s.head!);
        g.ellipse(10, 'mark', 43.5, 16, 4.6, 1.2, { flat: true, clip: 10, keep: true });
        pulseCore(g, 4, 34, 41.5, 2.1);
      },
      front: (g) => hindLeg(g, 27, 50, 5, 6.2),
    }),
  },
};

export const PIXEL_SPECIES: PixelSpecies[] = [
  IGNISAUR, AXOLUNAR, FLORABUD, LIVOLT, INKTOPUS, SOLAREJO, MAGMADILLO, NUBEBALLENA, CACTUERNO, FENIXEL, CERBITO, KIRISOL,
  LEVIATIN, YGGDRITO, PRIMPULSO,
];

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
  const foot = (e: E, phase: number): E => step(p, e, phase);
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
    if (s.feet) ell(2, s.boots ? 'mark' : 'skin', foot(s.feet.far, -p.leg), s.boots ? { flat: true } : { tone: 'shade' });
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
    if (s.feet) ell(7, s.boots ? 'mark' : 'skin', foot(s.feet.near, p.leg), s.boots ? { flat: true } : {});
    g.with(translate(0, sit), () => {
      if (s.arm) {
        g.with(rotateAt(q(-p.armR, 10), s.arm[0] - 1, s.arm[1] - s.arm[3]), () => {
          ell(8, 'skin', s.arm!);
          if (s.boots) g.ellipse(8, 'mark', s.arm![0] + 0.5, s.arm![1] + s.arm![3] * 0.6, s.arm![2] * 0.8, s.arm![3] * 0.5, { flat: true, clip: 8, keep: true });
        });
      }
      s.front?.(g, s, p);
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
      anchors = { head: s.hat ? r(s.hat[0], s.hat[1]) : r(H[0], H[1] - H[3]), face, neck: r(s.neck[0], s.neck[1]), back: r(s.back[0], s.back[1]) };
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
