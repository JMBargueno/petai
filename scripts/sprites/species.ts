/**
 * Dibujo paramétrico de cada especie en un frame de 128×128, en 3/4 mirando abajo-derecha (suelo en
 * y=120) y con variaciones por etapa (GUIA_ARTISTICA §7.4).
 * La pose (`Pose`) mueve cuerpo, extremidades, cola, apéndices y cara; los efectos van aparte.
 */
import { apple, Ctx, face, FaceAnchors, Fx, Eyes, lit, litStroke, Mouth, part } from './draw';

export interface Pose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
  eyes: Eyes;
  mouth: Mouth;
  look: number;
  /** Ángulo del brazo trasero y delantero (grados; positivo = levantar). */
  armL: number;
  armR: number;
  /** Fase de piernas (-1..1) para andar/colgar. */
  leg: number;
  /** Sentado (piernas hacia delante). */
  sit: boolean;
  /** Giro de la cola (grados). */
  tail: number;
  /** Escala y giro de apéndices (branquias, pétalos, llama). */
  app: number;
  appRot: number;
  blush: boolean;
  tears: number;
  /** Comida delante de la boca: -1 = ninguna, 0..3 = mordiscos. */
  food: number;
  fx: Fx[];
}

export const pose = (o: Partial<Pose> = {}): Pose => ({
  dx: 0,
  dy: 0,
  sx: 1,
  sy: 1,
  rot: 0,
  eyes: 'open',
  mouth: 'smile',
  look: 0,
  armL: 0,
  armR: 0,
  leg: 0,
  sit: false,
  tail: 0,
  app: 1,
  appRot: 0,
  blush: false,
  tears: 0,
  food: -1,
  fx: [],
  ...o,
});


// ───────────────────────── Etapas (GUIA_ARTISTICA §7.4) ─────────────────────────

export type Stage = 'baby' | 'juvenile' | 'adult' | 'final';
export const STAGES: Stage[] = ['baby', 'juvenile', 'adult', 'final'];

export interface StageParams {
  /** Escala de toda la criatura respecto a los pies (64, 120). */
  size: number;
  /** Escala extra de la cabeza respecto a su cuello (cabezón de bebé). */
  head: number;
  /** Multiplicador de apéndices (branquias, pétalos, llama, púas). */
  app: number;
  /** Multiplicador del radio de ojo. */
  eye: number;
  /** Accesorio de etapa final. */
  accessory: boolean;
}

const STAGE_PARAMS: Record<Stage, StageParams> = {
  baby: { size: 0.78, head: 1.26, app: 0.55, eye: 1.18, accessory: false },
  juvenile: { size: 0.9, head: 1.12, app: 0.8, eye: 1.08, accessory: false },
  adult: { size: 1, head: 1, app: 1, eye: 1, accessory: false },
  final: { size: 1.05, head: 0.97, app: 1.15, eye: 1, accessory: true },
};

export const stageParams = (stage: Stage = 'adult'): StageParams => STAGE_PARAMS[stage] ?? STAGE_PARAMS.adult;

export interface SpeciesArt {
  id: string;
  /** Anclas de la cara en adulto (las poses las usan para colocar efectos). */
  face: FaceAnchors;
  /** Punto sobre la cabeza (para efectos como zzz o anillos). */
  top: [number, number];
  /** Dibuja la criatura en 3/4 mirando abajo-derecha. `stage` por defecto: adult. */
  draw: (ctx: Ctx, p: Pose, stage?: Stage) => string;
}

const rotAt = (deg: number, x: number, y: number) => `rotate(${deg.toFixed(2)} ${x} ${y})`;
const scaleAt = (s: number, x: number, y: number, inner: string) =>
  s === 1 ? inner : `<g transform="translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})">${inner}</g>`;

/** Pierna rechoncha; con `sit` se estira hacia delante. */
function leg(ctx: Ctx, x: number, y: number, phase: number, sit: boolean, w = 8, h = 10): string {
  const lift = sit ? 0 : Math.max(0, phase) * 4;
  const fwd = sit ? 6 + phase * 3 : phase * 3;
  const cx = x + fwd;
  const cy = y - lift + (sit ? -2 : 0);
  return part(ctx, 'limb', (a) => `<ellipse cx="${cx}" cy="${cy}" rx="${sit ? h : w}" ry="${sit ? w * 0.8 : h * 0.75}" ${a}/>`, {
    stroke: 2.6,
  });
}

/** Brazo pequeño que rota desde el hombro. */
function arm(ctx: Ctx, sx: number, sy: number, angle: number, len = 13, w = 5.5, role: 'limb' | 'mix' = 'limb'): string {
  // 0° = colgando hacia abajo y algo adelante; positivo = levantar hacia delante/arriba
  return `<g transform="${rotAt(70 - angle, sx, sy)}">${part(
    ctx,
    role,
    (a) => `<ellipse cx="${sx + len / 2}" cy="${sy}" rx="${len / 2 + 1}" ry="${w}" ${a}/>`,
    { stroke: 2.6 },
  )}</g>`;
}

function stageFace(a: FaceAnchors, st: StageParams): FaceAnchors {
  return { ...a, er: a.er * st.eye };
}

function foodAndFace(ctx: Ctx, anchors: FaceAnchors, p: Pose): string {
  let out = face(ctx, anchors, { eyes: p.eyes, mouth: p.mouth, look: p.look, blush: p.blush, tears: p.tears });
  if (p.food >= 0) out += apple(ctx, anchors.mouth[0] + 12, anchors.mouth[1] + 8, p.food);
  return out;
}

/** Destello de 4 puntas (color literal) para accesorios de etapa final. */
function twinkle(ctx: Ctx, x: number, y: number, s: number, color: string): string {
  const d = `M${x} ${y - 5 * s}Q${x + 1 * s} ${y - 1 * s} ${x + 5 * s} ${y}Q${x + 1 * s} ${y + 1 * s} ${x} ${y + 5 * s}Q${x - 1 * s} ${y + 1 * s} ${x - 5 * s} ${y}Q${x - 1 * s} ${y - 1 * s} ${x} ${y - 5 * s}Z`;
  return `<path d="${d}" ${lit(ctx, color)}/><path d="${d}" ${litStroke(ctx, '#7a5200', 1.1)}/>`;
}

// ───────────────────────── Axolunar (ajolote lunar) ─────────────────────────
// 3/4: cabeza ancha delante-derecha, cuerpo y cola hacia atrás-izquierda. Branquias a ambos lados;
// las lejanas (derecha) más pequeñas y detrás de la cabeza.

const axolunarFace: FaceAnchors = { l: [72, 66], r: [93, 65], er: 5, mouth: [84, 76], far: 0.74 };

function gills(ctx: Ctx, cx: number, cy: number, side: -1 | 1, p: Pose, k0 = 1): string {
  let out = '';
  const angles = side < 0 ? [-150, -175, 160] : [-30, -5, 20];
  angles.forEach((ang, k) => {
    const a = ang + p.appRot * side + (k - 1) * 2;
    const len = 15 * p.app * k0;
    out += `<g transform="${rotAt(a, cx, cy + (k - 1) * 6 * k0)}">${part(
      ctx,
      'accent',
      (attrs) => `<ellipse cx="${cx + len * 0.55}" cy="${cy + (k - 1) * 6 * k0}" rx="${len * 0.6}" ry="${4.2 * k0}" ${attrs}/>`,
      { stroke: 2.4 },
    )}</g>`;
  });
  return out;
}

const axolunar: SpeciesArt = {
  id: 'axolunar',
  face: axolunarFace,
  top: [78, 38],
  draw(ctx, p0, stage = 'adult') {
    const st = stageParams(stage);
    const p = { ...p0, app: p0.app * st.app };
    let out = '';
    // Cola con aleta (atrás-izquierda)
    out += `<g transform="${rotAt(p.tail, 42, 96)}">${part(
      ctx,
      'accent',
      (a) => `<path d="M44 90Q24 76 8 84Q20 92 18 102Q30 106 44 102Z" ${a}/>`,
      { stroke: 2.6 },
    )}${part(ctx, 'body', (a) => `<path d="M46 92Q30 88 18 92Q30 98 46 101Z" ${a}/>`, { stroke: 2.4 })}</g>`;
    // Patas lejanas (asoman detrás)
    out += leg(ctx, 60, 108, p.leg, p.sit, 6.5, 8);
    out += leg(ctx, 90, 110, -p.leg, p.sit, 6.5, 8);
    out += arm(ctx, 92, 94, p.armR, 10, 4.2);
    // Cuerpo
    out += part(ctx, 'body', (a) => `<ellipse cx="63" cy="98" rx="28" ry="19" ${a}/>`, {
      shade: { cx: 72, cy: 115, rx: 32, ry: 10 },
      hi: { cx: 52, cy: 88, rx: 11, ry: 5 },
    });
    out += part(ctx, 'accent', (a) => `<ellipse cx="72" cy="105" rx="16" ry="9" ${a}/>`, { stroke: 2 });
    // Cabeza (escala de etapa respecto al cuello)
    let head = '';
    head += gills(ctx, 101, 60, 1, p, 0.82); // lejanas, detrás
    head += gills(ctx, 54, 64, -1, p);
    head += part(ctx, 'body', (a) => `<ellipse cx="79" cy="66" rx="28" ry="22" ${a}/>`, {
      shade: { cx: 86, cy: 86, rx: 30, ry: 9 },
      hi: { cx: 68, cy: 53, rx: 12, ry: 5.5 },
    });
    // Marca de luna en la frente
    head += part(ctx, 'accent', (a) => `<path d="M74 44A9 9 0 1 0 86 54A7 7 0 1 1 74 44Z" ${a}/>`, { stroke: 1.8 });
    head += foodAndFace(ctx, stageFace(axolunarFace, st), p);
    if (st.accessory) {
      // Final: media luna flotante con destellos
      head += part(ctx, 'accent', (a) => `<path d="M70 22A12 12 0 1 0 90 30A9 9 0 1 1 70 22Z" ${a}/>`, { stroke: 2 });
      head += twinkle(ctx, 98, 22, 0.9, '#fff3b0') + twinkle(ctx, 62, 30, 0.7, '#fff3b0');
    }
    out += scaleAt(st.head, 76, 84, head);
    // Patas y brazo cercanos
    out += leg(ctx, 48, 116, -p.leg, p.sit);
    out += leg(ctx, 76, 118, p.leg, p.sit);
    out += arm(ctx, 50, 94, p.armL, 12, 5);
    return scaleAt(st.size, 64, 120, out);
  },
};

// ───────────────────────── Florabud (capullo) ─────────────────────────
// 3/4: bulbo con la cara desplazada a la derecha y la corona de pétalos inclinada.

const florabudFace: FaceAnchors = { l: [66, 84], r: [85, 83], er: 5, mouth: [77, 94], far: 0.74 };

function petals(ctx: Ctx, p: Pose, cx: number, cy: number): string {
  let out = '';
  // Corona vista en 3/4: los pétalos de detrás más cortos (escorzo)
  const angles = [-165, -128, -92, -56, -18];
  angles.forEach((ang, k) => {
    const a = ang + p.appRot * (k % 2 === 0 ? 1 : -1);
    const fore = k === 0 || k === 4 ? 0.85 : 1;
    const len = 17 * p.app * fore;
    out += `<g transform="${rotAt(a, cx, cy)}">${part(
      ctx,
      'accent',
      (attrs) => `<ellipse cx="${cx + len * 0.6}" cy="${cy}" rx="${len * 0.62}" ry="7" ${attrs}/>`,
      { stroke: 2.4 },
    )}</g>`;
  });
  out += part(ctx, 'mix', (a) => `<ellipse cx="${cx}" cy="${cy}" rx="7.5" ry="6.5" ${a}/>`, { stroke: 2.2 });
  return out;
}

function leafArm(ctx: Ctx, sx: number, sy: number, angle: number, side: -1 | 1, k = 1): string {
  // 0° = hoja caída hacia fuera; positivo = levantar
  const deg = side < 0 ? 130 + angle : 50 - angle;
  const L = 22 * k;
  return `<g transform="${rotAt(deg, sx, sy)}">${part(
    ctx,
    'mix',
    (a) => `<path d="M${sx} ${sy}Q${sx + L * 0.45} ${sy - 8 * k} ${sx + L} ${sy}Q${sx + L * 0.45} ${sy + 8 * k} ${sx} ${sy}Z" ${a}/>`,
    { stroke: 2.4 },
  )}<path d="M${sx + 2} ${sy}L${sx + L * 0.8} ${sy}" ${ctx.mode === 'mask' ? 'fill="none" stroke="rgb(140,140,0)" stroke-width="1.4"' : 'fill="none" stroke="#1e1e1e" stroke-width="1.4"'}/></g>`;
}

const florabud: SpeciesArt = {
  id: 'florabud',
  face: florabudFace,
  top: [70, 30],
  draw(ctx, p0, stage = 'adult') {
    const st = stageParams(stage);
    const p = { ...p0, app: p0.app * st.app };
    let out = '';
    // Hoja y pie lejanos (derecha, detrás)
    out += leafArm(ctx, 96, 90, p.armR, 1, 0.85);
    out += leg(ctx, 86, 112, p.leg, p.sit, 6, 7);
    // Cabeza = corona + cara; el bulbo es cuerpo y cabeza a la vez
    let crown = petals(ctx, p, 70, 56);
    if (st.accessory) {
      // Final: segunda corona interior y flor abierta
      crown += [-140, -90, -40]
        .map(
          (ang) =>
            `<g transform="${rotAt(ang + p.appRot, 70, 56)}">${part(ctx, 'mix', (a) => `<ellipse cx="79" cy="56" rx="8" ry="4.5" ${a}/>`, { stroke: 2 })}</g>`,
        )
        .join('');
      crown += part(ctx, 'accent', (a) => `<circle cx="70" cy="55" r="5" ${a}/>`, { stroke: 2 });
      crown += twinkle(ctx, 92, 40, 0.8, '#fff3b0');
    }
    out += scaleAt(st.head, 70, 64, crown);
    // Bulbo
    out += part(
      ctx,
      'body',
      (a) => `<path d="M70 56C96 60 102 90 98 104C94 118 46 118 42 104C38 90 46 58 70 56Z" ${a}/>`,
      { shade: { cx: 80, cy: 120, rx: 34, ry: 12 }, hi: { cx: 56, cy: 72, rx: 10, ry: 7 } },
    );
    out += part(ctx, 'accent', (a) => `<ellipse cx="77" cy="107" rx="15" ry="7.5" ${a}/>`, { stroke: 2 });
    out += scaleAt(st.head, 76, 92, foodAndFace(ctx, stageFace(florabudFace, st), p));
    // Pie y hoja cercanos
    out += leg(ctx, 58, 116, -p.leg, p.sit, 7.5, 8.5);
    out += leafArm(ctx, 46, 92, p.armL, -1);
    return scaleAt(st.size, 64, 120, out);
  },
};

// ───────────────────────── Ignisaur (dinosaurio de fuego) ─────────────────────────
// 3/4: cabeza redonda con hocico corto hacia abajo-derecha; púas por el lomo hacia atrás-izquierda.

const ignisaurFace: FaceAnchors = { l: [80, 60], r: [98, 59], er: 4.9, mouth: [94, 73], far: 0.74 };

function flame(ctx: Ctx, x: number, y: number, s: number, flicker: number): string {
  const h = 18 * s;
  const w = 9 * s;
  const tip = y - h - flicker * 3;
  const outer = `M${x} ${tip}Q${x + w * 1.4} ${y - h * 0.4} ${x + w * 0.7} ${y}Q${x} ${y + w * 0.5} ${x - w * 0.7} ${y}Q${x - w * 1.4} ${y - h * 0.5} ${x} ${tip}Z`;
  const inner = `M${x} ${tip + h * 0.4}Q${x + w * 0.7} ${y - h * 0.2} ${x + w * 0.35} ${y}Q${x} ${y + w * 0.2} ${x - w * 0.35} ${y}Q${x - w * 0.7} ${y - h * 0.25} ${x} ${tip + h * 0.4}Z`;
  return `<path d="${outer}" ${lit(ctx, '#ff7a1a')}/><path d="${outer}" ${litStroke(ctx, '#8a2a00', 1.8)}/><path d="${inner}" ${lit(ctx, '#ffd84d')}/>`;
}

const spike = (ctx: Ctx, x: number, y: number, s: number) =>
  part(ctx, 'accent', (a) => `<path d="M${x - 6 * s} ${y + 4}L${x} ${y - 9 * s}L${x + 6 * s} ${y + 4}Z" ${a}/>`, { stroke: 2.2 });

const ignisaur: SpeciesArt = {
  id: 'ignisaur',
  face: ignisaurFace,
  top: [86, 32],
  draw(ctx, p0, stage = 'adult') {
    const st = stageParams(stage);
    const p = { ...p0, app: p0.app * st.app };
    let out = '';
    // Cola con llama (atrás-izquierda)
    out += `<g transform="${rotAt(p.tail, 42, 98)}">${part(
      ctx,
      'body',
      (a) => `<path d="M46 90Q26 94 14 82Q14 98 22 104Q34 110 48 104Z" ${a}/>`,
      { stroke: 2.6 },
    )}${flame(ctx, 15, 82, p.app, Math.sin(p.appRot / 6))}</g>`;
    // Púas del lomo (crecen con la etapa)
    for (const [x, y, s] of [
      [44, 82, 0.9],
      [55, 76, 1],
    ] as const) {
      out += spike(ctx, x, y, s * st.app);
    }
    // Patas y brazo lejanos
    out += leg(ctx, 60, 108, p.leg, p.sit, 7, 9);
    out += leg(ctx, 86, 110, -p.leg, p.sit, 7, 9);
    out += arm(ctx, 88, 94, p.armR, 9, 3.8);
    // Cuerpo
    out += part(ctx, 'body', (a) => `<ellipse cx="62" cy="97" rx="26" ry="20" ${a}/>`, {
      shade: { cx: 70, cy: 115, rx: 30, ry: 9 },
      hi: { cx: 52, cy: 86, rx: 10, ry: 5 },
    });
    out += part(ctx, 'accent', (a) => `<ellipse cx="70" cy="104" rx="14" ry="11" ${a}/>`, { stroke: 2 });
    // Cabeza
    let head = '';
    head += spike(ctx, 74, 46, 1 * st.app);
    head += spike(ctx, 86, 41, 0.9 * st.app);
    if (st.accessory) head += flame(ctx, 92, 40, 0.75, Math.sin(p.appRot / 6 + 1)); // Final: cresta de fuego
    head += part(
      ctx,
      'body',
      (a) => `<path d="M64 64C62 46 78 38 92 40C106 42 114 54 112 66C110 78 100 84 86 84C72 84 64 76 64 64Z" ${a}/>`,
      { shade: { cx: 94, cy: 86, rx: 28, ry: 8 }, hi: { cx: 78, cy: 48, rx: 12, ry: 5 } },
    );
    // Fosa nasal visible (lado cercano del hocico)
    head += `<circle cx="104" cy="66" r="1.6" ${ctx.mode === 'mask' ? 'fill="rgb(255,0,0)"' : 'fill="#1e1e1e"'}/>`;
    head += foodAndFace(ctx, stageFace(ignisaurFace, st), p);
    out += scaleAt(st.head, 74, 82, head);
    // Patas y brazo cercanos
    out += leg(ctx, 46, 116, -p.leg, p.sit, 9, 11);
    out += leg(ctx, 74, 118, p.leg, p.sit, 9, 11);
    out += arm(ctx, 50, 92, p.armL, 11, 4.6);
    return scaleAt(st.size, 64, 120, out);
  },
};

export const SPECIES: SpeciesArt[] = [axolunar, florabud, ignisaur];
