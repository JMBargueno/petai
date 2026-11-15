/** Huevo con colores literales: balanceo, temblor, grietas y eclosión. */
import { Ctx, fx, Fx, lit, litStroke } from './draw';

const SHELL = '#fff4d6';
const SHELL_SHADE = '#f1ddb0';
const SPOT_A = '#ffc94d';
const SPOT_B = '#7fd0ff';
const LINE = '#3b2a12';

interface EggPose {
  rot: number;
  dy: number;
  sy: number;
  cracks: number;
  /** Desplazamiento de la tapa (0 = cerrada). */
  cap: number;
  capRot: number;
  /** Mostrar la parte de abajo de la cáscara (sin tapa). */
  open: boolean;
  hidden: boolean;
  fx: Fx[];
}

const egg = (o: Partial<EggPose>): EggPose => ({ rot: 0, dy: 0, sy: 1, cracks: 0, cap: 0, capRot: 0, open: false, hidden: false, fx: [], ...o });

const EGG_PATH = 'M64 26C44 26 32 58 32 80C32 104 46 118 64 118C82 118 96 104 96 80C96 58 84 26 64 26Z';
const BOTTOM_PATH = 'M32 76L40 70L48 78L56 68L64 78L72 68L80 78L88 70L96 76C96 104 82 118 64 118C46 118 32 104 32 76Z';
const CAP_PATH = 'M32 76L40 70L48 78L56 68L64 78L72 68L80 78L88 70L96 76C96 58 84 26 64 26C44 26 32 58 32 80Z';

function shell(ctx: Ctx, path: string, id: string): string {
  return (
    `<path d="${path}" ${lit(ctx, SHELL)}/>` +
    `<clipPath id="${id}"><path d="${path}"/></clipPath>` +
    `<ellipse cx="70" cy="118" rx="36" ry="22" ${lit(ctx, SHELL_SHADE)} clip-path="url(#${id})"/>` +
    `<circle cx="50" cy="56" r="7" ${lit(ctx, SPOT_A)} clip-path="url(#${id})"/>` +
    `<circle cx="78" cy="90" r="9" ${lit(ctx, SPOT_B)} clip-path="url(#${id})"/>` +
    `<circle cx="74" cy="46" r="4.5" ${lit(ctx, SPOT_B)} clip-path="url(#${id})"/>` +
    `<circle cx="46" cy="98" r="5" ${lit(ctx, SPOT_A)} clip-path="url(#${id})"/>` +
    `<ellipse cx="54" cy="44" rx="5" ry="9" ${lit(ctx, '#ffffff', 0.8)} clip-path="url(#${id})"/>` +
    `<path d="${path}" ${litStroke(ctx, LINE, 3)}/>`
  );
}

const CRACKS = [
  'M60 40L66 50L60 58L68 66',
  'M40 76L50 72L54 80L62 74',
  'M88 62L80 70L84 78L76 84',
];

export function drawEgg(ctx: Ctx, p: EggPose): string {
  let body = '';
  if (!p.hidden) {
    if (p.open) {
      body += shell(ctx, BOTTOM_PATH, ctx.uid());
      body += `<g transform="translate(0 ${-p.cap}) rotate(${p.capRot} 64 60)">${shell(ctx, CAP_PATH, ctx.uid())}</g>`;
    } else {
      body += shell(ctx, EGG_PATH, ctx.uid());
      for (let k = 0; k < p.cracks; k++) body += `<path d="${CRACKS[k]}" ${litStroke(ctx, LINE, 2.4)}/>`;
    }
  }
  const t = `translate(0 ${p.dy}) rotate(${p.rot} 64 118) translate(64 118) scale(1 ${p.sy}) translate(-64 -118)`;
  const behind = p.fx.filter((f) => f.b).map((f) => fx(ctx, f)).join('');
  const front = p.fx.filter((f) => !f.b).map((f) => fx(ctx, f)).join('');
  return behind + `<g transform="${t}">${body}</g>` + front;
}

export const EGG_POSES: Record<string, (i: number, n: number) => EggPose> = {
  idle: (i) => egg({ rot: [-3, 0, 3, 0][i], sy: [1, 1.01, 1, 0.99][i] }),
  shake: (i) => egg({ rot: [-12, 10, -8, 12, -10, 6][i], dy: i % 2 ? -2 : 0 }),
  crack: (i) =>
    egg({
      cracks: Math.min(3, 1 + Math.floor(i / 2)),
      rot: i % 2 ? 5 : -5,
      fx: i === 5 ? [{ k: 'sparkle', x: 70, y: 48, s: 0.9 }] : [],
    }),
  hatch: (i) => {
    const burst: Fx[] = [
      { k: 'glow', x: 64, y: 70, r: 18 + i * 5, a: i < 6 ? 0.5 : 0.2, c: '#fff4b0', b: true },
      { k: 'sparkle', x: 30, y: 40 - i * 2, a: 1 - i / 9 },
      { k: 'sparkle', x: 100, y: 34 - i * 2, s: 0.8, a: 1 - i / 9 },
      { k: 'star', x: 64, y: 22 - i, s: 0.7, a: 1 - i / 9 },
    ];
    switch (i) {
      case 0:
        return egg({ cracks: 3, rot: -8 });
      case 1:
        return egg({ cracks: 3, rot: 8, fx: [{ k: 'glow', x: 64, y: 70, r: 14, a: 0.5, c: '#fff4b0', b: true }] });
      case 2:
        return egg({ open: true, cap: 6, capRot: -6, fx: burst.slice(0, 1) });
      case 3:
        return egg({ open: true, cap: 18, capRot: -18, fx: burst.slice(0, 2) });
      case 4:
        return egg({ open: true, cap: 34, capRot: -32, fx: burst });
      case 5:
        return egg({ open: true, cap: 60, capRot: -50, fx: burst });
      case 6:
        return egg({ hidden: true, fx: burst });
      default:
        return egg({ hidden: true, fx: burst.slice(1) });
    }
  },
};
