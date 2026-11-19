import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash, span } from './fxMath';
import { METAL } from './cofreTier';

/**
 * Sello del Éter: lo que entrega el propio Éter (un código canjeado o un regalo del equipo que lo
 * cuida) no viaja por la hebra de otro Custodio como `paquete-hebra`: se condensa en un sello
 * cristalizado que cae de una grieta sobre el Santuario y se rompe en destellos del color de lo que
 * trae (LORE §1, el Éter atrae hacia el Santuario lo que le corresponde).
 *
 * `params.reward` = lo más valioso de la entrega (`coins` dorado, `gems` cian, `pro` prisma,
 * `chest` el metal del cofre según `params.tier`, `accessory` rosa). El sello es del Flujo del
 * Pockai; su núcleo, su runa, los destellos y el glifo que queda flotando, del color de lo recibido.
 *
 * Fases: grieta (se abre el vacío) · caída (el sello baja y la grieta se cierra) · grietas (tiembla
 * y se raja con la luz de dentro) · estallido (se parte en cuatro, rayos, glifo y lluvia de
 * destellos) · fundido (el glifo sube y se apaga, los destellos caen).
 *
 * Rejilla 64×80 ×2; pies en la fila 76; el sello flota sobre la cabeza (centro en la fila 13).
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
/** Centro del sello y radio del rombo (19×19). */
const SY = 18;
const R = 9;
/** Fila de la grieta del Éter. */
const RIFT_Y = 4;
const WHITE = '#ffffff';

export type RewardKind = 'coins' | 'gems' | 'pro' | 'chest' | 'accessory';

interface RewardRamp {
  deep: string;
  mid: string;
  light: string;
  /** Colores de los destellos (el Prisma de Pro alterna varios). */
  spark: string[];
}

const RAMPS: Record<Exclude<RewardKind, 'chest'>, RewardRamp> = {
  coins: { deep: '#b38600', mid: '#ffd731', light: '#fff4b0', spark: ['#ffd731', '#fff4b0'] },
  gems: { deep: '#1a8fb8', mid: '#4fe3ff', light: '#c8f8ff', spark: ['#4fe3ff', '#c8f8ff'] },
  pro: { deep: '#5a2ca0', mid: '#b06bff', light: '#e6c8ff', spark: ['#b06bff', '#4fe3ff', '#ff7ad9', '#ffd731'] },
  accessory: { deep: '#c9407f', mid: '#ff7ab8', light: '#ffd0e6', spark: ['#ff7ab8', '#ffd0e6'] },
};

/** Rampa de lo recibido; el cofre toma la del metal de su tipo (la misma que `cofre-tier`). */
export function rewardRamp(reward: unknown, tier: unknown): RewardRamp {
  if (reward === 'chest') {
    const m = METAL[String(tier ?? '')] ?? METAL['bronze']!;
    return { deep: m.deep, mid: m.mid, light: m.light, spark: [m.mid, m.light] };
  }
  return RAMPS[String(reward ?? '') as keyof typeof RAMPS] ?? RAMPS.coins;
}

/** Glifos de 7×7 de lo recibido (d = hondo, m = medio, l = claro, w = blanco). */
const GLYPHS: Record<RewardKind, string[]> = {
  coins: ['..ddd..', '.dllmd.', 'dllmmmd', 'dlmwmmd', 'dmmmmdd', '.dmmdd.', '..ddd..'],
  gems: ['.dmmmd.', 'dlwlmmd', 'ddddddd', '.dlmmd.', '..dmd..', '...d...'],
  pro: ['...w...', '...l...', '..lml..', 'wlmwmlw', '..lml..', '...l...', '...w...'],
  chest: ['.ddddd.', 'dmmmmmd', 'dllwlld', 'ddddddd', 'dmmwmmd', 'dmmmmmd', 'ddddddd'],
  accessory: ['dd...dd', 'dld.dld', 'dlmdmmd', 'dmmwmmd', 'dlmdmmd', 'dmd.dmd', 'dd...dd'],
};

function kindOf(f: FxFrame): RewardKind {
  const r = String(f.params['reward'] ?? '');
  return r in GLYPHS ? (r as RewardKind) : 'coins';
}

/** Glifo centrado en (cx, cy); `keep(x, y)` decide qué píxeles quedan (para el fundido). */
function paintGlyph(c: Canvas2, kind: RewardKind, ramp: RewardRamp, cx: number, cy: number, keep: (x: number, y: number) => boolean = () => true) {
  const rows = GLYPHS[kind];
  const ox = cx - 3;
  const oy = cy - Math.floor(rows.length / 2);
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === '.' || !keep(i, j)) return;
      c.set(ox + i, oy + j, ch === 'd' ? ramp.deep : ch === 'm' ? ramp.mid : ch === 'l' ? ramp.light : WHITE);
    }),
  );
}

/**
 * Rombo del sello. Borde y facetas del Flujo del Pockai; dentro, el marco de la runa y el núcleo
 * del color de lo recibido. `crack` (0..1) abre grietas de luz desde el centro por los ejes.
 * `quadrant` pinta solo un cuarto (los pedazos del estallido): 0 arriba-izq, 1 arriba-der,
 * 2 abajo-izq, 3 abajo-der.
 */
function paintSeal(c: Canvas2, f: FxFrame, ramp: RewardRamp, cx: number, cy: number, crack: number, pulse: boolean, quadrant = -1) {
  const p = f.palette;
  for (let dy = -R; dy <= R; dy++) {
    const half = R - Math.abs(dy);
    for (let dx = -half; dx <= half; dx++) {
      if (quadrant >= 0 && (dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0) !== quadrant) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      let color: string;
      if (d === R) color = p.deep;
      else if (d === R - 1) color = dx + dy < 0 ? p.light : p.mid;
      else if (d === R - 2) color = dx + dy < 0 ? p.mid : p.deep;
      else if (d === R - 3) color = ramp.mid;
      else if (d === 0) color = pulse ? WHITE : ramp.light;
      else if (d === 1) color = ramp.light;
      else color = ramp.deep;
      if (crack > 0 && (dx === 0 || dy === 0) && d > 0 && d <= Math.round(crack * R)) color = d === R ? WHITE : ramp.light;
      c.set(cx + dx, cy + dy, color);
    }
  }
}

/** Grieta del vacío del Éter: una lente horizontal de media anchura `w`. */
function paintRift(c: Canvas2, f: FxFrame, w: number) {
  const half = Math.round(w);
  if (half < 1) return;
  const p = f.palette;
  for (let dx = -half; dx <= half; dx++) c.set(CX + dx, RIFT_Y, Math.abs(dx) === half ? p.glow : p.void0);
  const side = half - 2;
  for (let dx = -side; dx <= side; dx++) {
    const edge = Math.abs(dx) === side;
    c.set(CX + dx, RIFT_Y - 1, edge ? p.light : p.void1);
    c.set(CX + dx, RIFT_Y + 1, edge ? p.light : p.void1);
  }
}

function plus(c: Canvas2, x: number, y: number, core: string, arm: string) {
  c.set(x, y, core);
  c.set(x - 1, y, arm);
  c.set(x + 1, y, arm);
  c.set(x, y - 1, arm);
  c.set(x, y + 1, arm);
}

const SPARKS = 20;

/**
 * Halo del glifo: un aro de luz del color de lo recibido con cuatro puntas blancas que giran
 * (`turn` 0/1), como una medalla que el Éter deja flotando. `keep` decide qué píxeles quedan.
 */
function paintHalo(c: Canvas2, ramp: RewardRamp, cx: number, cy: number, turn: number, keep: (x: number, y: number) => boolean = () => true) {
  const RING = 7;
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * RING);
    const y = Math.round(cy + Math.sin(a) * RING);
    if (keep(x, y)) c.set(x, y, k % 4 < 2 ? ramp.mid : ramp.light);
  }
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * Math.PI * 2 + (turn ? Math.PI / 4 : 0);
    const x = Math.round(cx + Math.cos(a) * (RING + 2));
    const y = Math.round(cy + Math.sin(a) * (RING + 2));
    if (keep(x, y)) c.set(x, y, WHITE);
  }
}

/**
 * Lluvia de destellos: salen del sello en abanico y caen alrededor de la mascota. `u` recorre el
 * estallido y el fundido (0..1); en el fundido (`fade` 0..1) se van apagando hasta no quedar ninguno.
 */
function paintSparks(c: Canvas2, f: FxFrame, ramp: RewardRamp, u: number, fade: number) {
  for (let k = 0; k < SPARKS; k++) {
    if (fade > 0 && hash(k, 9, f.seed) < fade) continue;
    const a = Math.PI * (0.1 + 0.8 * (k / (SPARKS - 1))) + (hash(k, 1, f.seed) - 0.5) * 0.4;
    const reach = 16 + hash(k, 2, f.seed) * 14;
    const out = easeOut(Math.min(1, u * 1.8));
    const x = CX + Math.cos(a) * reach * out * (k % 2 ? 1 : -1);
    const fall = 0.65 + hash(k, 3, f.seed) * 0.35;
    const y = SY - Math.sin(a) * reach * 0.5 * out + easeIn(u) * fall * (FEET - 4 - SY);
    const color = ramp.spark[k % ramp.spark.length]!;
    const twinkle = Math.floor(f.time / 166 + k) % 3 === 0;
    if (k % 3 === 0 && !twinkle) plus(c, x, y, WHITE, color);
    else c.set(x, y, twinkle ? WHITE : color);
  }
}

function draw(sink: PixelSink, f: FxFrame): void {
  // El sello y sus pedazos llevan contorno; la grieta va encima (el sello «sale» de ella)
  const fx = new Canvas2(W, H);
  const rift = new Canvas2(W, H);
  const kind = kindOf(f);
  const ramp = rewardRamp(f.params['reward'], f.params['tier']);
  const pulse = Math.floor(f.time / 166) % 2 === 0;

  if (f.reduced) {
    // Quieto: el glifo de lo recibido en su halo, con una corona fija de destellos
    paintHalo(fx, ramp, CX, SY, 0);
    paintGlyph(fx, kind, ramp, CX, SY);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      plus(fx, CX + Math.cos(a) * 14, SY + Math.sin(a) * 11, WHITE, ramp.spark[k % ramp.spark.length]!);
    }
  } else {
    switch (f.phase) {
      case 'grieta':
        paintRift(rift, f, 2 + easeOut(f.t) * 11);
        break;
      case 'caida': {
        const cy = Math.round(-R + easeOut(span(f.t, 0, 0.8)) * (SY + R));
        paintSeal(fx, f, ramp, CX, cy, 0, false);
        paintRift(rift, f, 13 * (1 - easeIn(span(f.t, 0.35, 1))));
        break;
      }
      case 'grietas': {
        const shake = f.t > 0.3 ? (Math.floor(f.time / 83) % 2 ? 1 : -1) : 0;
        paintSeal(fx, f, ramp, CX + shake, SY, span(f.t, 0.2, 1), pulse);
        break;
      }
      case 'estallido': {
        // Cuatro pedazos salen en diagonal y caen
        if (f.t < 0.75) {
          const d = easeOut(f.t) * 14;
          const fall = f.t * f.t * 10;
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], q) => {
            if (f.t > 0.45 && hash(q, Math.floor(f.t * 12), f.seed) < span(f.t, 0.45, 0.75)) return;
            const piece = new Canvas2(W, H);
            paintSeal(piece, f, ramp, CX + sx! * d, SY + sy! * d * 0.7 + fall, 1, false, q);
            piece.cells.forEach((col, i) => col && fx.set(i % W, Math.floor(i / W), col));
          });
        }
        // Rayos del color de lo recibido
        if (f.t < 0.6) {
          const r0 = 6 + easeOut(f.t / 0.6) * 14;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            for (let s = 0; s < 4; s++) fx.set(CX + Math.cos(a) * (r0 + s), SY + Math.sin(a) * (r0 + s) * 0.75, s === 0 ? WHITE : ramp.light);
          }
        }
        if (f.t > 0.2) {
          paintHalo(fx, ramp, CX, SY, pulse ? 1 : 0);
          paintGlyph(fx, kind, ramp, CX, SY);
        }
        paintSparks(fx, f, ramp, f.t * 0.55, 0);
        break;
      }
      case 'fundido': {
        const rise = Math.round(easeIn(f.t) * 6);
        const keep = (x: number, y: number) => hash(x, y + Math.floor(f.t * 8) * 7, f.seed) >= f.t;
        paintHalo(fx, ramp, CX, SY - rise, pulse ? 1 : 0, keep);
        paintGlyph(fx, kind, ramp, CX, SY - rise, keep);
        paintSparks(fx, f, ramp, 0.55 + f.t * 0.45, f.t);
        break;
      }
    }
  }
  fx.flush(sink, f.palette.outline);
  rift.flush(sink, f.palette.outline);
}

export const selloEter: EffectDef = {
  id: 'sello-eter',
  lore: 'Lo que entrega el propio Éter (un código canjeado o un regalo del equipo) se condensa en un sello sobre el Santuario y se rompe en destellos del color de lo recibido (LORE §1).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { seal: { x: CX, y: SY } },
  layer: 'front',
  priority: 2,
  phases: [
    { name: 'grieta', ms: 250 },
    { name: 'caida', ms: 460 },
    { name: 'grietas', ms: 420 },
    { name: 'estallido', ms: 660 },
    { name: 'fundido', ms: 500 },
  ],
  reducedPhases: [
    { name: 'grieta', ms: 0 },
    { name: 'caida', ms: 0 },
    { name: 'grietas', ms: 0 },
    { name: 'estallido', ms: 1200 },
    { name: 'fundido', ms: 240 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'estallido') return Math.min(1, f.t * 5);
    if (f.phase === 'fundido') return 1 - f.t;
    return 1;
  },
};
