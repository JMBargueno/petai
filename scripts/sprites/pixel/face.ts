/**
 * Cara, comida y efectos en pixel art. Todo son colores literales: no pasan por la paleta.
 * Las posiciones llegan ya transformadas por la pose; los mapas de bits no se giran ni se escalan.
 */
import type { Eyes, Fx, Mouth } from '../draw';
import { Grid, hex, Rgb } from './raster';

const EYE = hex('#1e1e1e');
const WHITE = hex('#ffffff');
const MOUTH = hex('#8b0000');
const BLUSH = hex('#ff8fa3');
const TEAR = hex('#4da2ff');
const SUN = hex('#ffd731');
const EMBER = hex('#fb4903');
const CARBON = hex('#0b0a14');

/** Ojos en espacio local de la cabeza (px nativos). `x1` es el ojo cercano; `x2`, el lejano. */
export interface EyeSpec {
  y: number;
  h: number;
  x1: number;
  w1: number;
  x2: number;
  w2: number;
  /** Lado del brillo del ojo cercano (1 o 2). */
  glint: number;
  /** Separación vertical entre el ojo y la boca. */
  gap: number;
}

function eye(g: Grid, x: number, y: number, w: number, h: number, kind: Eyes, glint: number, near: boolean, look: number): void {
  const mid = y + Math.floor(h / 2);
  x += look;
  const round = (yy: number, hh: number) => {
    g.rect(x, yy + 1, w, hh - 2, EYE);
    g.rect(x + (w > 2 ? 1 : 0), yy, Math.max(1, w - 2), hh, EYE);
  };
  switch (kind) {
    case 'closed':
      g.rect(x, mid, w, 1, EYE);
      return;
    case 'happy':
      g.rect(x + 1, mid - 1, Math.max(1, w - 2), 1, EYE);
      g.put(x, mid, EYE);
      g.put(x + w - 1, mid, EYE);
      return;
    case 'sad':
    case 'cry':
      g.rect(x + 1, mid + 1, Math.max(1, w - 2), 1, EYE);
      g.put(x, mid, EYE);
      g.put(x + w - 1, mid, EYE);
      if (kind === 'cry') g.rect(x + (near ? 0 : w - 1), mid + 2, 1, 2, TEAR);
      return;
    case 'half':
      g.rect(x, mid, w, 1, EYE);
      g.rect(x, mid + 1, w, Math.max(1, h - Math.floor(h / 2) - 2), EYE);
      return;
    case 'x': {
      const s = Math.min(w, 3);
      for (let k = 0; k < s; k++) {
        g.put(x + k, mid - 1 + k, EYE);
        g.put(x + s - 1 - k, mid - 1 + k, EYE);
      }
      return;
    }
    case 'star':
      g.rect(x, mid, Math.max(3, w), 1, SUN);
      g.rect(x + Math.floor(Math.max(3, w) / 2), mid - 1, 1, 3, SUN);
      return;
    case 'heart':
      g.bitmap(x - (w < 4 ? 1 : 0), mid - 2, ['a.a', 'aaa', 'aaa', '.a.'], { a: EMBER });
      return;
    case 'wide':
      round(y - 1, h + 1);
      g.rect(x + 1, y, 2, 2, WHITE);
      return;
    case 'angry':
      round(y, h);
      // Ceja inclinada hacia el centro de la cara: recorta la esquina interior.
      g.rect(x + 1, y + 2, Math.max(1, glint > 1 ? 2 : 1), 1, WHITE);
      for (let k = 0; k < w; k++) g.put(x + k, y - 2 + (near ? Math.round((k * 2) / w) : Math.round(((w - 1 - k) * 2) / w)), EYE);
      return;
    default:
      round(y, h);
      g.rect(x + 1, y + 1, glint, glint, WHITE);
  }
}

function mouth(g: Grid, x: number, y: number, kind: Mouth): void {
  const px = (pts: [number, number][]) => pts.forEach(([dx, dy]) => g.put(x + dx, y + dy, MOUTH));
  switch (kind) {
    case 'grin':
      g.rect(x - 1, y, 6, 1, MOUTH);
      g.rect(x, y + 1, 4, 1, MOUTH);
      return;
    case 'open':
      g.rect(x, y, 4, 2, MOUTH);
      g.rect(x + 1, y + 2, 2, 1, MOUTH);
      return;
    case 'o':
      g.rect(x + 1, y, 2, 2, MOUTH);
      return;
    case 'yawn':
      g.rect(x, y - 1, 4, 4, MOUTH);
      return;
    case 'frown':
      return px([[0, 1], [1, 0], [2, 0], [3, 1]]);
    case 'flat':
      return px([[0, 0], [1, 0], [2, 0], [3, 0]]);
    case 'chew':
      return px([[1, 0], [2, 0], [1, 1], [2, 1]]);
    case 'wavy':
      return px([[0, 0], [1, 1], [2, 0], [3, 1]]);
    default:
      return px([[0, 0], [1, 1], [2, 1], [3, 0]]);
  }
}

export interface FaceOpts {
  eyes: Eyes;
  mouth: Mouth;
  look: number;
  blush: boolean;
  tears: number;
  food: number;
  /** Ceja de 1 px de la etapa final (mirada decidida). */
  brow: boolean;
  browColor: Rgb;
}

/** Dibuja ojos, boca, rubor, lágrimas y comida. `g` lleva puesta la transformación de la cabeza. */
export function drawFace(g: Grid, e: EyeSpec, o: FaceOpts): { face: [number, number] } {
  const r = (p: [number, number]) => [Math.round(p[0]), Math.round(p[1])] as [number, number];
  const [x1, y1] = r(g.point(e.x1, e.y));
  const [x2, y2] = r(g.point(e.x2, e.y));
  const look = Math.max(-1, Math.min(1, Math.round(o.look / 2)));
  eye(g, x1, y1, e.w1, e.h, o.eyes, e.glint, true, look);
  eye(g, x2, y2, e.w2, e.h, o.eyes, 1, false, look);
  if (o.brow && (o.eyes === 'open' || o.eyes === 'wide')) {
    g.rect(x1 - 1, y1 - 2, e.w1 + 1, 1, o.browColor);
    g.put(x1 + e.w1, y1 - 1, o.browColor);
    g.rect(x2, y2 - 2, e.w2 + 1, 1, o.browColor);
    g.put(x2 - 1, y2 - 1, o.browColor);
  }
  const [mx, my] = r(g.point((e.x1 + e.w1 + e.x2) / 2 - 1, e.y + e.h + e.gap));
  mouth(g, mx, my, o.mouth);
  if (o.blush) {
    g.rect(x1 - 2, y1 + e.h, 2, 1, BLUSH);
    g.rect(x2 + e.w2, y2 + e.h, 2, 1, BLUSH);
  }
  for (let k = 0; k < Math.min(3, Math.round(o.tears)); k++) {
    g.rect(x1 + 1, y1 + e.h + 1 + k * 3, 1, 2, TEAR);
    g.rect(x2 + 1, y2 + e.h + 2 + k * 3, 1, 2, TEAR);
  }
  if (o.food >= 0) apple(g, mx + 7, my - 1, Math.min(3, Math.round(o.food)));
  return { face: [Math.round((x1 + x2 + e.w2) / 2), y1 + Math.floor(e.h / 2)] };
}

/** Manzana con mordiscos (0 = entera … 3 = casi acabada). */
function apple(g: Grid, x: number, y: number, bites: number): void {
  const RED = hex('#ff4b4b');
  const DARK = hex('#7a1414');
  const rows = [
    ['..g.s..', '.ooooo.', 'oahaaao', 'oaaaaao', 'oaaaaao', '.oaaao.', '..ooo..'],
    ['..g.s..', '.oooo..', 'oahaao.', 'oaaaao.', 'oaaaao.', '.oooo..'],
    ['.g.s.', '.ooo.', 'oahao', 'oaaao', '.ooo.'],
    ['.s.', 'ooo', 'oao', 'ooo'],
  ][bites];
  g.bitmap(x - Math.floor(rows[0].length / 2), y - Math.floor(rows.length / 2), rows, {
    o: DARK, a: RED, h: hex('#ffb3b3'), s: hex('#6b3e1f'), g: hex('#4caf50'),
  });
}

// ───────────────────────── Efectos ─────────────────────────

const CONFETTI = ['#ff5d8f', '#ffd23f', '#3bceac', '#4da2ff', '#a46cff'].map(hex);

const BITMAPS: Partial<Record<Fx['k'], { rows: string[]; small?: string[]; color: string }>> = {
  zzz: { rows: ['aaaaa', '...a.', '..a..', '.a...', 'aaaaa'], small: ['aaa', '.a.', 'aaa'], color: '#4da2ff' },
  heart: {
    rows: ['.oo...oo.', 'oaao.oaao', 'ohaaaaaao', 'oaaaaaaao', '.oaaaaao.', '..oaaao..', '...oao...', '....o....'],
    small: ['a.a', 'aaa', '.a.'],
    color: '#ff5d8f',
  },
  star: { rows: ['..a..', '.aaa.', 'aaaaa', '.aaa.', 'a...a'], small: ['.a.', 'aaa', '.a.'], color: '#ffd731' },
  sparkle: { rows: ['..a..', '..a..', 'aahaa', '..a..', '..a..'], small: ['.a.', 'aha', '.a.'], color: '#ffd731' },
  note: { rows: ['..aa', '..a.', '..a.', 'aaa.', 'aaa.'], color: '#5c4ade' },
  sweat: { rows: ['.a.', '.a.', 'aha', 'aaa'], color: '#4da2ff' },
  drop: { rows: ['.a.', '.a.', 'aha', 'aaa'], color: '#4da2ff' },
  bubble: { rows: ['.aa.', 'ah.a', 'a..a', '.aa.'], small: ['aa', 'aa'], color: '#9fd4ff' },
  impact: { rows: ['a.a.a', '.aaa.', 'aahaa', '.aaa.', 'a.a.a'], color: '#ffd731' },
  puff: { rows: ['.aa..', 'aaaa.', 'aaaaa', '.aaa.'], small: ['aa', 'aa'], color: '#e6e4ee' },
  plus: { rows: ['.a.', 'aaa', '.a.'], color: '#55db9c' },
  arrow: { rows: ['..a..', '.aaa.', 'aaaaa', '..a..', '..a..'], color: '#55db9c' },
  swirl: { rows: ['.aaa.', 'a...a', 'a.a.a', 'a.aa.', '.a...'], color: '#b9b5d8' },
  exclaim: { rows: ['a', 'a', 'a', '.', 'a'], color: '#fb4903' },
  speed: { rows: ['aaaaa'], small: ['aaa'], color: '#ffffff' },
  thought: { rows: ['a....', '..a..', '....a'], color: '#ffffff' },
  crumb: { rows: ['a'], color: '#c9772e' },
};

/** Efecto en coordenadas del frame de 128 (como en `poses.ts`); se dibuja en la rejilla de 64. */
export function drawFx(g: Grid, f: Fx): void {
  if ((f.a ?? 1) < 0.3) return; // sin transparencias parciales: un efecto muy tenue no se pinta
  const x = Math.round(f.x / 2);
  const y = Math.round(f.y / 2);
  const s = f.s ?? 1;
  if (f.k === 'confetti') {
    const c = CONFETTI[Math.abs(Math.round(f.x * 7 + (f.r ?? 0))) % CONFETTI.length];
    g.rect(x, y, 2, 2, c);
    return;
  }
  if (f.k === 'ring' || f.k === 'glow') {
    // Anillo punteado: se dibuja con píxeles alternos, sin relleno.
    const rad = Math.max(3, Math.round(((f.r ?? 28) * s) / 2));
    const c = f.c ? hex(f.c) : f.k === 'glow' ? hex('#fff1b3') : WHITE;
    const steps = Math.max(12, Math.round(rad * 3));
    for (let k = 0; k < steps; k += 2) {
      const a = (k / steps) * Math.PI * 2;
      g.put(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.8, c);
    }
    return;
  }
  const b = BITMAPS[f.k];
  if (!b) return;
  const rows = s < 0.75 && b.small ? b.small : b.rows;
  g.bitmap(x - Math.floor(rows[0].length / 2), y - Math.floor(rows.length / 2), rows, {
    a: hex(f.c && /^#[0-9a-f]{6}$/i.test(f.c) ? f.c : b.color),
    o: CARBON,
    h: WHITE,
  });
}
