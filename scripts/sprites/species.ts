/**
 * Dibujo paramétrico de cada especie en un frame de 128×128 (mirando a la derecha, suelo en y=120).
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

export interface SpeciesArt {
  id: string;
  face: FaceAnchors;
  /** Punto sobre la cabeza (para efectos como zzz o anillos). */
  top: [number, number];
  draw: (ctx: Ctx, p: Pose) => string;
}

const rotAt = (deg: number, x: number, y: number) => `rotate(${deg.toFixed(2)} ${x} ${y})`;

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

function foodAndFace(ctx: Ctx, anchors: FaceAnchors, p: Pose): string {
  let out = face(ctx, anchors, { eyes: p.eyes, mouth: p.mouth, look: p.look, blush: p.blush, tears: p.tears });
  if (p.food >= 0) out += apple(ctx, anchors.mouth[0] + 12, anchors.mouth[1] + 8, p.food);
  return out;
}

// ───────────────────────── Axolunar (ajolote lunar) ─────────────────────────

const axolunarFace: FaceAnchors = { l: [64, 66], r: [86, 66], er: 5, mouth: [76, 77] };

function gills(ctx: Ctx, cx: number, cy: number, side: -1 | 1, p: Pose): string {
  let out = '';
  const angles = side < 0 ? [-150, -175, 160] : [-30, -5, 20];
  angles.forEach((ang, k) => {
    const a = ang + p.appRot * side + (k - 1) * 2;
    const len = 15 * p.app;
    out += `<g transform="${rotAt(a, cx, cy + (k - 1) * 6)}">${part(
      ctx,
      'accent',
      (attrs) => `<ellipse cx="${cx + len * 0.55}" cy="${cy + (k - 1) * 6}" rx="${len * 0.6}" ry="4.2" ${attrs}/>`,
      { stroke: 2.4 },
    )}</g>`;
  });
  return out;
}

const axolunar: SpeciesArt = {
  id: 'axolunar',
  face: axolunarFace,
  top: [74, 36],
  draw(ctx, p) {
    let out = '';
    // Cola con aleta
    out += `<g transform="${rotAt(p.tail, 40, 96)}">${part(
      ctx,
      'accent',
      (a) => `<path d="M42 88Q22 74 6 84Q20 90 18 100Q30 104 42 102Z" ${a}/>`,
      { stroke: 2.6 },
    )}${part(ctx, 'body', (a) => `<path d="M44 90Q28 86 16 90Q28 96 44 100Z" ${a}/>`, { stroke: 2.4 })}</g>`;
    // Piernas traseras
    out += leg(ctx, 46, 114, -p.leg, p.sit);
    out += arm(ctx, 50, 98, p.armL, 12, 5);
    // Cuerpo
    out += part(ctx, 'body', (a) => `<ellipse cx="62" cy="96" rx="30" ry="20" ${a}/>`, {
      shade: { cx: 62, cy: 114, rx: 34, ry: 10 },
      hi: { cx: 54, cy: 86, rx: 12, ry: 5 },
    });
    out += part(ctx, 'accent', (a) => `<ellipse cx="68" cy="104" rx="17" ry="9" ${a}/>`, { stroke: 2 });
    // Branquias (detrás de la cabeza)
    out += gills(ctx, 52, 62, -1, p);
    out += gills(ctx, 96, 62, 1, p);
    // Cabeza
    out += part(ctx, 'body', (a) => `<ellipse cx="75" cy="66" rx="29" ry="23" ${a}/>`, {
      shade: { cx: 75, cy: 86, rx: 30, ry: 9 },
      hi: { cx: 66, cy: 52, rx: 13, ry: 6 },
    });
    // Marca de luna en la frente
    out += part(ctx, 'accent', (a) => `<path d="M70 44A9 9 0 1 0 82 54A7 7 0 1 1 70 44Z" ${a}/>`, { stroke: 1.8 });
    out += foodAndFace(ctx, axolunarFace, p);
    // Piernas y brazo delanteros
    out += leg(ctx, 78, 114, p.leg, p.sit);
    out += arm(ctx, 82, 98, p.armR, 12, 5);
    return out;
  },
};

// ───────────────────────── Florabud (capullo) ─────────────────────────

const florabudFace: FaceAnchors = { l: [58, 84], r: [78, 84], er: 5, mouth: [69, 95] };

function petals(ctx: Ctx, p: Pose): string {
  let out = '';
  const cx = 66;
  const cy = 56;
  const angles = [-160, -125, -90, -55, -20];
  angles.forEach((ang, k) => {
    const a = ang + p.appRot * (k % 2 === 0 ? 1 : -1);
    const len = 17 * p.app;
    out += `<g transform="${rotAt(a, cx, cy)}">${part(
      ctx,
      'accent',
      (attrs) => `<ellipse cx="${cx + len * 0.6}" cy="${cy}" rx="${len * 0.62}" ry="7" ${attrs}/>`,
      { stroke: 2.4 },
    )}</g>`;
  });
  out += part(ctx, 'mix', (a) => `<circle cx="${cx}" cy="${cy}" r="7" ${a}/>`, { stroke: 2.2 });
  return out;
}

function leafArm(ctx: Ctx, sx: number, sy: number, angle: number, side: -1 | 1): string {
  // 0° = hoja caída hacia fuera; positivo = levantar
  const deg = side < 0 ? 130 + angle : 50 - angle;
  return `<g transform="${rotAt(deg, sx, sy)}">${part(
    ctx,
    'mix',
    (a) => `<path d="M${sx} ${sy}Q${sx + 10} ${sy - 8} ${sx + 22} ${sy}Q${sx + 10} ${sy + 8} ${sx} ${sy}Z" ${a}/>`,
    { stroke: 2.4 },
  )}<path d="M${sx + 2} ${sy}L${sx + 18} ${sy}" ${ctx.mode === 'mask' ? 'fill="none" stroke="rgb(140,140,0)" stroke-width="1.4"' : 'fill="none" stroke="#1e1e1e" stroke-width="1.4"'}/></g>`;
}

const florabud: SpeciesArt = {
  id: 'florabud',
  face: florabudFace,
  top: [66, 30],
  draw(ctx, p) {
    let out = '';
    out += petals(ctx, p);
    // Raíces/pies
    out += leg(ctx, 54, 115, -p.leg, p.sit, 7, 8);
    out += leafArm(ctx, 44, 92, p.armL, -1);
    // Cuerpo bulbo
    out += part(
      ctx,
      'body',
      (a) => `<path d="M68 58C94 62 100 92 96 104C92 118 44 118 40 104C36 90 44 60 68 58Z" ${a}/>`,
      { shade: { cx: 68, cy: 118, rx: 34, ry: 12 }, hi: { cx: 56, cy: 72, rx: 10, ry: 7 } },
    );
    out += part(ctx, 'accent', (a) => `<ellipse cx="70" cy="106" rx="16" ry="8" ${a}/>`, { stroke: 2 });
    out += foodAndFace(ctx, florabudFace, p);
    out += leg(ctx, 80, 115, p.leg, p.sit, 7, 8);
    out += leafArm(ctx, 92, 92, p.armR, 1);
    return out;
  },
};

// ───────────────────────── Ignisaur (dinosaurio de fuego) ─────────────────────────

const ignisaurFace: FaceAnchors = { l: [78, 60], r: [96, 60], er: 4.8, mouth: [98, 74] };

function flame(ctx: Ctx, x: number, y: number, s: number, flicker: number): string {
  const h = 18 * s;
  const w = 9 * s;
  const tip = y - h - flicker * 3;
  const outer = `M${x} ${tip}Q${x + w * 1.4} ${y - h * 0.4} ${x + w * 0.7} ${y}Q${x} ${y + w * 0.5} ${x - w * 0.7} ${y}Q${x - w * 1.4} ${y - h * 0.5} ${x} ${tip}Z`;
  const inner = `M${x} ${tip + h * 0.4}Q${x + w * 0.7} ${y - h * 0.2} ${x + w * 0.35} ${y}Q${x} ${y + w * 0.2} ${x - w * 0.35} ${y}Q${x - w * 0.7} ${y - h * 0.25} ${x} ${tip + h * 0.4}Z`;
  return `<path d="${outer}" ${lit(ctx, '#ff7a1a')}/><path d="${outer}" ${litStroke(ctx, '#8a2a00', 1.8)}/><path d="${inner}" ${lit(ctx, '#ffd84d')}/>`;
}

const ignisaur: SpeciesArt = {
  id: 'ignisaur',
  face: ignisaurFace,
  top: [86, 30],
  draw(ctx, p) {
    let out = '';
    // Cola con llama
    out += `<g transform="${rotAt(p.tail, 42, 98)}">${part(
      ctx,
      'body',
      (a) => `<path d="M44 90Q24 92 12 80Q14 96 22 102Q34 108 46 104Z" ${a}/>`,
      { stroke: 2.6 },
    )}${flame(ctx, 13, 80, p.app, Math.sin(p.appRot / 6))}</g>`;
    // Púas del lomo
    for (const [x, y, s] of [
      [48, 78, 1],
      [60, 72, 1.1],
      [72, 46, 1],
      [84, 40, 0.9],
    ] as const) {
      out += part(ctx, 'accent', (a) => `<path d="M${x - 6 * s} ${y + 4}L${x} ${y - 9 * s}L${x + 6 * s} ${y + 4}Z" ${a}/>`, {
        stroke: 2.2,
      });
    }
    out += leg(ctx, 48, 114, -p.leg, p.sit, 9, 11);
    out += arm(ctx, 56, 96, p.armL, 11, 4.6);
    // Cuerpo
    out += part(ctx, 'body', (a) => `<ellipse cx="60" cy="96" rx="27" ry="20" ${a}/>`, {
      shade: { cx: 60, cy: 114, rx: 30, ry: 9 },
      hi: { cx: 52, cy: 86, rx: 10, ry: 5 },
    });
    out += part(ctx, 'accent', (a) => `<ellipse cx="66" cy="104" rx="15" ry="10" ${a}/>`, { stroke: 2 });
    // Cabeza con hocico
    out += part(
      ctx,
      'body',
      (a) => `<path d="M62 64C62 44 82 38 96 44C108 48 114 60 112 70C110 82 96 86 82 84C68 82 62 76 62 64Z" ${a}/>`,
      { shade: { cx: 88, cy: 86, rx: 28, ry: 8 }, hi: { cx: 80, cy: 48, rx: 12, ry: 5 } },
    );
    // Fosas nasales
    out += `<circle cx="108" cy="62" r="1.6" ${ctx.mode === 'mask' ? 'fill="rgb(255,0,255)"' : 'fill="#1e1e1e"'}/>`;
    out += foodAndFace(ctx, ignisaurFace, p);
    out += leg(ctx, 74, 114, p.leg, p.sit, 9, 11);
    out += arm(ctx, 80, 96, p.armR, 11, 4.6);
    return out;
  },
};

export const SPECIES: SpeciesArt[] = [axolunar, florabud, ignisaur];
