/**
 * Primitivas de dibujo SVG para el generador de sprites.
 *
 * Cada figura se pinta en tres modos:
 *  - base:  sombreado y lineart en grises (se multiplica por el color al hornear en el cliente)
 *  - mask:  canales de color — R = primario, G = secundario, B = zona de patrón.
 *           Negro puro (0,0,0) con alfa = "color literal": el cliente usa el color de base.png
 *           tal cual (efectos como lágrimas, corazones, chispas o la comida).
 *  - color: vista previa con la paleta por defecto de la especie (fallback SVG).
 */
export type Mode = 'base' | 'mask' | 'color';
export type Role = 'body' | 'limb' | 'accent' | 'mix';

export interface Palette {
  primary: string;
  secondary: string;
}

export interface Ctx {
  mode: Mode;
  palette: Palette;
  /** Prefijo único por frame para ids de clipPath. */
  uid: () => string;
}

export const LINE = '#1e1e1e';

const BASE_FILL: Record<Role, string> = {
  body: '#efefef',
  limb: '#e2e2e2',
  accent: '#f4f4f4',
  mix: '#ebebeb',
};

const MASK_FILL: Record<Role, string> = {
  body: 'rgb(255,0,255)',
  limb: 'rgb(255,0,0)',
  accent: 'rgb(0,255,0)',
  mix: 'rgb(140,140,0)',
};

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

export function roleFill(ctx: Ctx, role: Role): string {
  if (ctx.mode === 'base') return BASE_FILL[role];
  if (ctx.mode === 'mask') return MASK_FILL[role];
  const { primary, secondary } = ctx.palette;
  if (role === 'accent') return secondary;
  if (role === 'mix') return mixHex(primary, secondary, 0.5);
  if (role === 'limb') return mixHex(primary, '#000000', 0.08);
  return primary;
}

/** Atributos de relleno para un color literal (efectos). */
export function lit(ctx: Ctx, color: string, opacity = 1): string {
  const fill = ctx.mode === 'mask' ? '#000000' : color;
  return `fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity.toFixed(3)}"` : ''}`;
}

/** Atributos de trazo literal. */
export function litStroke(ctx: Ctx, color: string, width: number, opacity = 1): string {
  const stroke = ctx.mode === 'mask' ? '#000000' : color;
  return `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${
    opacity < 1 ? ` stroke-opacity="${opacity.toFixed(3)}"` : ''
  }`;
}

/** Trazo de rasgo facial (lineart). En la máscara usa el color del cuerpo para no romper la silueta. */
export function featureStroke(ctx: Ctx, width: number): string {
  const stroke = ctx.mode === 'mask' ? MASK_FILL.body : LINE;
  return `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
}

export function featureFill(ctx: Ctx, color: 'line' | 'white'): string {
  if (ctx.mode === 'mask') return `fill="${MASK_FILL.body}"`;
  return `fill="${color === 'line' ? LINE : '#ffffff'}"`;
}

interface Shade {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Pieza con contorno, sombra inferior y brillo (solo en base/color).
 * `shape(attrs)` devuelve el elemento SVG con los atributos de pintura dados.
 */
export function part(
  ctx: Ctx,
  role: Role,
  shape: (attrs: string) => string,
  opts: { shade?: Shade; hi?: Shade; stroke?: number } = {},
): string {
  const stroke = opts.stroke ?? 3;
  const fill = roleFill(ctx, role);
  const strokeColor = ctx.mode === 'mask' ? fill : LINE;
  let out = shape(`fill="${fill}"`);
  if (ctx.mode !== 'mask' && (opts.shade || opts.hi)) {
    const id = ctx.uid();
    out += `<clipPath id="${id}">${shape('')}</clipPath>`;
    if (opts.shade) {
      const s = opts.shade;
      const shadeFill = ctx.mode === 'base' ? 'fill="#c2c2c2"' : 'fill="#000000" fill-opacity="0.16"';
      out += `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" ${shadeFill} clip-path="url(#${id})"/>`;
    }
    if (opts.hi) {
      const h = opts.hi;
      const hiFill = ctx.mode === 'base' ? 'fill="#fbfbfb"' : 'fill="#ffffff" fill-opacity="0.35"';
      out += `<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" ${hiFill} clip-path="url(#${id})"/>`;
    }
  }
  out += shape(`fill="none" stroke="${strokeColor}" stroke-width="${stroke}" stroke-linejoin="round"`);
  return out;
}

// ───────────────────────── Cara ─────────────────────────

export type Eyes =
  | 'open'
  | 'closed'
  | 'happy'
  | 'sad'
  | 'cry'
  | 'half'
  | 'x'
  | 'star'
  | 'wide'
  | 'angry'
  | 'heart';

export type Mouth =
  | 'smile'
  | 'grin'
  | 'open'
  | 'o'
  | 'frown'
  | 'flat'
  | 'chew'
  | 'wavy'
  | 'yawn';

export interface FaceAnchors {
  l: [number, number];
  r: [number, number];
  /** Radio del ojo. */
  er: number;
  mouth: [number, number];
}

const PINK = '#ff6f91';
const GOLD = '#ffd23f';
const MOUTH_DARK = '#4a1420';
const TONGUE = '#ff8fa3';

export function starPath(cx: number, cy: number, r: number, points = 5, inner = 0.45, rot = -90): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    d += `${i === 0 ? 'M' : 'L'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

export function heartPath(cx: number, cy: number, s: number): string {
  const k = s / 10;
  const p = (x: number, y: number) => `${(cx + x * k).toFixed(2)} ${(cy + y * k).toFixed(2)}`;
  return `M${p(0, 8)}C${p(-12, 0)} ${p(-9, -10)} ${p(0, -4)}C${p(9, -10)} ${p(12, 0)} ${p(0, 8)}Z`;
}

function eye(ctx: Ctx, x: number, y: number, r: number, kind: Eyes, look: number, side: 'l' | 'r'): string {
  const w = Math.max(2, r * 0.55);
  switch (kind) {
    case 'closed':
      return `<path d="M${x - r} ${y}Q${x} ${y + r * 0.9} ${x + r} ${y}" ${featureStroke(ctx, w)}/>`;
    case 'happy':
      return `<path d="M${x - r} ${y + r * 0.4}Q${x} ${y - r * 1.1} ${x + r} ${y + r * 0.4}" ${featureStroke(ctx, w)}/>`;
    case 'cry': {
      const brow = side === 'l' ? `M${x - r} ${y - r * 1.2}L${x + r * 0.8} ${y - r * 1.8}` : `M${x - r * 0.8} ${y - r * 1.8}L${x + r} ${y - r * 1.2}`;
      return `<path d="M${x - r} ${y + r * 0.2}Q${x} ${y - r * 0.7} ${x + r} ${y + r * 0.2}" ${featureStroke(ctx, w)}/><path d="${brow}" ${featureStroke(ctx, w * 0.8)}/>`;
    }
    case 'half':
      return (
        `<path d="M${x - r * 0.85} ${y}A${r * 0.85} ${r} 0 0 0 ${x + r * 0.85} ${y}Z" ${featureFill(ctx, 'line')}/>` +
        `<path d="M${x - r * 1.05} ${y}L${x + r * 1.05} ${y}" ${featureStroke(ctx, w * 0.8)}/>`
      );
    case 'x':
      return `<path d="M${x - r * 0.8} ${y - r * 0.8}L${x + r * 0.8} ${y + r * 0.8}M${x + r * 0.8} ${y - r * 0.8}L${x - r * 0.8} ${y + r * 0.8}" ${featureStroke(ctx, w)}/>`;
    case 'star':
      return `<path d="${starPath(x, y, r * 1.35)}" ${lit(ctx, GOLD)}/><path d="${starPath(x, y, r * 1.35)}" ${litStroke(ctx, '#7a5200', 1.6)}/>`;
    case 'heart':
      return `<path d="${heartPath(x, y, r * 1.5)}" ${lit(ctx, PINK)}/><path d="${heartPath(x, y, r * 1.5)}" ${litStroke(ctx, '#7a1030', 1.4)}/>`;
    case 'wide':
      return (
        `<circle cx="${x}" cy="${y}" r="${r * 1.25}" ${featureFill(ctx, 'white')}/>` +
        `<circle cx="${x}" cy="${y}" r="${r * 1.25}" ${featureStroke(ctx, 2)}/>` +
        `<circle cx="${x + look * 0.6}" cy="${y}" r="${r * 0.45}" ${featureFill(ctx, 'line')}/>`
      );
    default: {
      // open, sad, angry: ojo ovalado negro con brillo
      let out =
        `<ellipse cx="${x + look}" cy="${y}" rx="${r * 0.82}" ry="${r}" ${featureFill(ctx, 'line')}/>` +
        `<circle cx="${x + look + r * 0.3}" cy="${y - r * 0.38}" r="${r * 0.32}" ${featureFill(ctx, 'white')}/>`;
      if (kind === 'sad') {
        const brow = side === 'l' ? `M${x - r} ${y - r * 1.3}L${x + r * 0.9} ${y - r * 1.9}` : `M${x - r * 0.9} ${y - r * 1.9}L${x + r} ${y - r * 1.3}`;
        out += `<path d="${brow}" ${featureStroke(ctx, w * 0.8)}/>`;
      } else if (kind === 'angry') {
        const brow = side === 'l' ? `M${x - r} ${y - r * 1.9}L${x + r * 0.9} ${y - r * 1.2}` : `M${x - r * 0.9} ${y - r * 1.2}L${x + r} ${y - r * 1.9}`;
        out += `<path d="${brow}" ${featureStroke(ctx, w)}/>`;
      }
      return out;
    }
  }
}

function mouth(ctx: Ctx, x: number, y: number, kind: Mouth, s: number): string {
  const w = Math.max(2, s * 0.5);
  switch (kind) {
    case 'grin':
      return (
        `<path d="M${x - s * 1.4} ${y - s * 0.3}Q${x} ${y + s * 1.9} ${x + s * 1.4} ${y - s * 0.3}Z" ${lit(ctx, MOUTH_DARK)}/>` +
        `<path d="M${x - s * 0.7} ${y + s * 0.75}Q${x} ${y + s * 0.2} ${x + s * 0.7} ${y + s * 0.75}Q${x} ${y + s * 1.25} ${x - s * 0.7} ${y + s * 0.75}Z" ${lit(ctx, TONGUE)}/>`
      );
    case 'open':
      return (
        `<ellipse cx="${x}" cy="${y + s * 0.4}" rx="${s * 0.95}" ry="${s * 1.05}" ${lit(ctx, MOUTH_DARK)}/>` +
        `<ellipse cx="${x}" cy="${y + s * 0.95}" rx="${s * 0.6}" ry="${s * 0.4}" ${lit(ctx, TONGUE)}/>`
      );
    case 'yawn':
      return `<ellipse cx="${x}" cy="${y + s * 0.6}" rx="${s * 1.1}" ry="${s * 1.5}" ${lit(ctx, MOUTH_DARK)}/>`;
    case 'o':
      return `<ellipse cx="${x}" cy="${y + s * 0.3}" rx="${s * 0.55}" ry="${s * 0.65}" ${lit(ctx, MOUTH_DARK)}/>`;
    case 'frown':
      return `<path d="M${x - s} ${y + s * 0.7}Q${x} ${y - s * 0.5} ${x + s} ${y + s * 0.7}" ${featureStroke(ctx, w)}/>`;
    case 'flat':
      return `<path d="M${x - s * 0.8} ${y + s * 0.2}L${x + s * 0.8} ${y + s * 0.2}" ${featureStroke(ctx, w)}/>`;
    case 'chew':
      return `<path d="M${x - s} ${y}Q${x - s * 0.5} ${y + s * 0.8} ${x} ${y + s * 0.2}Q${x + s * 0.5} ${y + s * 0.8} ${x + s} ${y}" ${featureStroke(ctx, w)}/>`;
    case 'wavy':
      return `<path d="M${x - s * 1.1} ${y + s * 0.4}L${x - s * 0.55} ${y}L${x} ${y + s * 0.4}L${x + s * 0.55} ${y}L${x + s * 1.1} ${y + s * 0.4}" ${featureStroke(ctx, w)}/>`;
    default:
      return `<path d="M${x - s} ${y}Q${x} ${y + s * 1.1} ${x + s} ${y}" ${featureStroke(ctx, w)}/>`;
  }
}

export interface FaceOpts {
  eyes: Eyes;
  mouth: Mouth;
  look: number;
  blush: boolean;
  tears: number;
}

export function face(ctx: Ctx, a: FaceAnchors, o: FaceOpts): string {
  let out = '';
  if (o.blush) {
    out += `<ellipse cx="${a.l[0] - a.er * 0.6}" cy="${a.l[1] + a.er * 1.7}" rx="${a.er * 0.9}" ry="${a.er * 0.5}" ${lit(ctx, '#ff9db5')}/>`;
    out += `<ellipse cx="${a.r[0] + a.er * 0.6}" cy="${a.r[1] + a.er * 1.7}" rx="${a.er * 0.9}" ry="${a.er * 0.5}" ${lit(ctx, '#ff9db5')}/>`;
  }
  out += eye(ctx, a.l[0], a.l[1], a.er, o.eyes, o.look, 'l');
  out += eye(ctx, a.r[0], a.r[1], a.er, o.eyes, o.look, 'r');
  out += mouth(ctx, a.mouth[0], a.mouth[1], o.mouth, a.er * 0.9);
  if (o.tears > 0) {
    for (const [ex, ey] of [a.l, a.r]) {
      for (let k = 0; k < o.tears; k++) {
        const ty = ey + a.er * 1.4 + k * a.er * 1.5;
        out += `<path d="${dropPath(ex, ty, a.er * 0.75)}" ${lit(ctx, '#5cc8ff')}/>`;
      }
    }
  }
  return out;
}

// ───────────────────────── Efectos ─────────────────────────

export function dropPath(x: number, y: number, s: number): string {
  return `M${x} ${y - s * 1.3}Q${x + s} ${y} ${x} ${y + s}Q${x - s} ${y} ${x} ${y - s * 1.3}Z`;
}

export type FxKind =
  | 'zzz'
  | 'heart'
  | 'star'
  | 'sparkle'
  | 'note'
  | 'sweat'
  | 'drop'
  | 'bubble'
  | 'impact'
  | 'ring'
  | 'puff'
  | 'plus'
  | 'arrow'
  | 'swirl'
  | 'exclaim'
  | 'confetti'
  | 'speed'
  | 'thought'
  | 'glow'
  | 'crumb';

export interface Fx {
  k: FxKind;
  x: number;
  y: number;
  /** Escala (1 = tamaño normal). */
  s?: number;
  /** Opacidad. */
  a?: number;
  /** Parámetro libre: rotación, radio, color… según el efecto. */
  r?: number;
  c?: string;
  /** Dibujar detrás del personaje (halos de luz). */
  b?: boolean;
}

const CONFETTI = ['#ff5d8f', '#ffd23f', '#3bceac', '#4da2ff', '#a46cff'];

export function fx(ctx: Ctx, f: Fx): string {
  const s = f.s ?? 1;
  const a = f.a ?? 1;
  const { x, y } = f;
  switch (f.k) {
    case 'zzz': {
      const z = 7 * s;
      const d = `M${x - z} ${y - z}L${x + z} ${y - z}L${x - z} ${y + z}L${x + z} ${y + z}`;
      return `<path d="${d}" ${litStroke(ctx, '#2b2d6e', 4.5 * s, a)}/><path d="${d}" ${litStroke(ctx, '#bcd4ff', 2.2 * s, a)}/>`;
    }
    case 'heart':
      return `<path d="${heartPath(x, y, 9 * s)}" ${lit(ctx, f.c ?? PINK, a)}/><path d="${heartPath(x, y, 9 * s)}" ${litStroke(ctx, '#7a1030', 1.6, a)}/>`;
    case 'star':
      return `<path d="${starPath(x, y, 9 * s, 5, 0.45, f.r ?? -90)}" ${lit(ctx, f.c ?? GOLD, a)}/><path d="${starPath(x, y, 9 * s, 5, 0.45, f.r ?? -90)}" ${litStroke(ctx, '#7a5200', 1.5, a)}/>`;
    case 'sparkle':
      return `<path d="${starPath(x, y, 8 * s, 4, 0.28, f.r ?? -90)}" ${lit(ctx, f.c ?? '#fff6c2', a)}/>`;
    case 'note': {
      const k = s;
      return (
        `<ellipse cx="${x}" cy="${y + 8 * k}" rx="${4.5 * k}" ry="${3.5 * k}" ${lit(ctx, f.c ?? '#7b5cff', a)}/>` +
        `<path d="M${x + 4 * k} ${y + 8 * k}L${x + 4 * k} ${y - 8 * k}Q${x + 10 * k} ${y - 6 * k} ${x + 11 * k} ${y - 1 * k}" ${litStroke(ctx, f.c ?? '#7b5cff', 2.4 * k, a)}/>`
      );
    }
    case 'sweat':
      return `<path d="${dropPath(x, y, 5 * s)}" ${lit(ctx, '#8fd8ff', a)}/><path d="${dropPath(x, y, 5 * s)}" ${litStroke(ctx, '#2a6fa8', 1.4, a)}/>`;
    case 'drop':
      return `<path d="${dropPath(x, y, 4 * s)}" ${lit(ctx, '#4db8ff', a)}/>`;
    case 'bubble':
      return (
        `<circle cx="${x}" cy="${y}" r="${7 * s}" ${lit(ctx, '#e8f8ff', 0.55 * a)}/>` +
        `<circle cx="${x}" cy="${y}" r="${7 * s}" ${litStroke(ctx, '#7cc9f2', 1.6, a)}/>` +
        `<circle cx="${x - 2.4 * s}" cy="${y - 2.4 * s}" r="${1.8 * s}" ${lit(ctx, '#ffffff', a)}/>`
      );
    case 'impact':
      return (
        `<path d="${starPath(x, y, 16 * s, 8, 0.45, f.r ?? -90)}" ${lit(ctx, '#ffe066', a)}/>` +
        `<path d="${starPath(x, y, 9 * s, 8, 0.45, (f.r ?? -90) + 22)}" ${lit(ctx, '#ffffff', a)}/>`
      );
    case 'ring':
      return `<circle cx="${x}" cy="${y}" r="${f.r ?? 20}" ${litStroke(ctx, f.c ?? '#ffe066', 3.5 * s, a)}/>`;
    case 'glow':
      return `<ellipse cx="${x}" cy="${y}" rx="${(f.r ?? 40) * s}" ry="${(f.r ?? 40) * s * 0.95}" ${lit(ctx, f.c ?? '#ffffff', a)}/>`;
    case 'puff':
      return (
        `<circle cx="${x}" cy="${y}" r="${6 * s}" ${lit(ctx, '#e9e4dc', a)}/>` +
        `<circle cx="${x + 6 * s}" cy="${y - 3 * s}" r="${4.5 * s}" ${lit(ctx, '#f4f0ea', a)}/>`
      );
    case 'plus': {
      const k = 6 * s;
      return `<path d="M${x - k} ${y}L${x + k} ${y}M${x} ${y - k}L${x} ${y + k}" ${litStroke(ctx, '#2bd67b', 4 * s, a)}/>`;
    }
    case 'arrow': {
      const k = 8 * s;
      return `<path d="M${x} ${y - k}L${x + k} ${y}L${x + k * 0.4} ${y}L${x + k * 0.4} ${y + k}L${x - k * 0.4} ${y + k}L${x - k * 0.4} ${y}L${x - k} ${y}Z" ${lit(ctx, '#ffd23f', a)}/><path d="M${x} ${y - k}L${x + k} ${y}L${x + k * 0.4} ${y}L${x + k * 0.4} ${y + k}L${x - k * 0.4} ${y + k}L${x - k * 0.4} ${y}L${x - k} ${y}Z" ${litStroke(ctx, '#7a5200', 1.6, a)}/>`;
    }
    case 'swirl': {
      const rot = f.r ?? 0;
      return `<g transform="rotate(${rot} ${x} ${y})"><path d="M${x} ${y}m-9 0a9 5 0 1 0 18 0a6 3.5 0 1 0 -12 0a3 2 0 1 0 6 0" ${litStroke(ctx, '#9b7bff', 2.4 * s, a)}/></g>`;
    }
    case 'exclaim':
      return (
        `<path d="M${x - 3.5 * s} ${y - 12 * s}L${x + 3.5 * s} ${y - 12 * s}L${x + 2 * s} ${y + 3 * s}L${x - 2 * s} ${y + 3 * s}Z" ${lit(ctx, '#ff4d4d', a)}/>` +
        `<circle cx="${x}" cy="${y + 8 * s}" r="${2.8 * s}" ${lit(ctx, '#ff4d4d', a)}/>`
      );
    case 'confetti': {
      const col = f.c ?? CONFETTI[Math.abs(Math.round(x + y)) % CONFETTI.length];
      return `<rect x="${x - 2.5 * s}" y="${y - 1.5 * s}" width="${5 * s}" height="${3 * s}" transform="rotate(${f.r ?? 0} ${x} ${y})" ${lit(ctx, col, a)}/>`;
    }
    case 'speed':
      return `<path d="M${x} ${y}L${x} ${y + 14 * s}" ${litStroke(ctx, '#cfd6e6', 2.4, a)}/>`;
    case 'thought':
      return (
        `<circle cx="${x - 14 * s}" cy="${y + 14 * s}" r="${2.5 * s}" ${lit(ctx, '#ffffff', a)}/>` +
        `<circle cx="${x - 9 * s}" cy="${y + 8 * s}" r="${3.5 * s}" ${lit(ctx, '#ffffff', a)}/>` +
        `<ellipse cx="${x}" cy="${y - 4 * s}" rx="${13 * s}" ry="${10 * s}" ${lit(ctx, '#ffffff', a)}/>` +
        `<ellipse cx="${x}" cy="${y - 4 * s}" rx="${13 * s}" ry="${10 * s}" ${litStroke(ctx, '#9aa3b5', 1.4, a)}/>` +
        drumstick(ctx, x, y - 4 * s, 0.7 * s, a)
      );
    case 'crumb':
      return `<circle cx="${x}" cy="${y}" r="${1.8 * s}" ${lit(ctx, '#c97b3a', a)}/>`;
    default:
      return '';
  }
}

export function drumstick(ctx: Ctx, x: number, y: number, s: number, a = 1): string {
  return (
    `<path d="M${x - 2 * s} ${y + 2 * s}L${x + 6 * s} ${y + 9 * s}" ${litStroke(ctx, '#f3ead8', 3.2 * s, a)}/>` +
    `<ellipse cx="${x - 3 * s}" cy="${y - 1 * s}" rx="${7 * s}" ry="${6 * s}" ${lit(ctx, '#c9772e', a)}/>`
  );
}

/** Manzana con mordiscos (0 = entera … 3 = casi acabada). */
export function apple(ctx: Ctx, x: number, y: number, bites: number): string {
  const r = 9 - bites * 1.6;
  let out = `<circle cx="${x}" cy="${y}" r="${r}" ${lit(ctx, '#ff4b4b')}/>`;
  out += `<circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.28}" ${lit(ctx, '#ffb3b3')}/>`;
  out += `<path d="M${x} ${y - r}L${x + 1} ${y - r - 4}" ${litStroke(ctx, '#6b3e1f', 2)}/>`;
  out += `<ellipse cx="${x + 4}" cy="${y - r - 3}" rx="3.6" ry="2" ${lit(ctx, '#4caf50')}/>`;
  for (let k = 0; k < bites; k++) {
    out += `<circle cx="${x - r * 0.95}" cy="${y - r * 0.5 + k * r * 0.55}" r="${r * 0.36}" ${lit(ctx, '#fff1d6')}/>`;
  }
  out += `<circle cx="${x}" cy="${y}" r="${r}" ${litStroke(ctx, '#7a1414', 1.6)}/>`;
  return out;
}
