/**
 * Huevo en pixel art, con colores literales (no pasa por la paleta de la mascota): balanceo,
 * temblor, grietas y eclosión. Las poses son las mismas de `../egg.ts`.
 */
import type { EggPose } from '../egg';
import { drawFx } from './face';
import { FLOOR, Grid, hex, mul, Ramp, rotateAt, scaleAt, translate } from './raster';


const SHELL: Ramp = { line: hex('#3b2a12'), shade: hex('#f1ddb0'), base: hex('#fff4d6'), light: hex('#fff4d6'), hi: hex('#ffffff') };
const flat = (c: string): Ramp => ({ line: hex('#3b2a12'), shade: hex(c), base: hex(c), light: hex(c), hi: hex(c) });
const SPOT_A = flat('#ffc94d');
const SPOT_B = flat('#7fd0ff');
const CRACK = hex('#3b2a12');

// Borde en zigzag que separa la tapa de la base al eclosionar (px nativos).
const ZIGZAG: [number, number][] = [[14, 38], [20, 35], [24, 39], [28, 34], [32, 39], [36, 34], [40, 39], [44, 35], [50, 38]];
const CRACKS: [number, number][][] = [
  [[30, 20], [33, 25], [30, 29], [34, 33]],
  [[20, 38], [25, 36], [27, 40], [31, 37]],
  [[44, 31], [40, 35], [42, 39], [38, 42]],
];

/** Cáscara completa (pieza `part`): dos elipses que dan la forma de huevo, manchas y brillo. */
function shell(g: Grid, part: number, within?: [number, number][]): void {
  g.ellipse(part, 'skin', 32, 44.5, 16, 14.5, { ramp: SHELL, within });
  g.ellipse(part, 'skin', 32, 39, 13.5, 19.5, { ramp: SHELL, hi: true, within });
  // Las dos elipses comparten pieza: la segunda repinta el sombreado de la zona común.
  g.ellipse(part, 'skin', 32, 44.5, 16, 14.5, { ramp: SHELL, clip: part, hi: true, within });
  const spot = (x: number, y: number, r: number, ramp: Ramp) => g.ellipse(part, 'skin', x, y, r, r * 0.9, { ramp, flat: true, clip: part, keep: true, within });
  spot(25, 28, 3.4, SPOT_A);
  spot(39, 45, 4.4, SPOT_B);
  spot(37, 23, 2.2, SPOT_B);
  spot(23, 49, 2.5, SPOT_A);
}

export function drawEggFrame(p: EggPose): Grid {
  const g = new Grid();
  p.fx.filter((f) => f.b).forEach((f) => drawFx(g, f));
  if (!p.hidden) {
    const body = mul(translate(0, Math.round(p.dy / 2)), mul(rotateAt(Math.round(p.rot / 2) * 2, 32, FLOOR - 1), scaleAt(1, Math.round(p.sy * 40) / 40, 32, FLOOR - 1)));
    g.with(body, () => {
      if (p.open) {
        // Base: la cáscara por debajo del zigzag.
        shell(g, 1, [[0, 64], [64, 64], [64, 38], ...[...ZIGZAG].reverse(), [0, 38]]);
        // Tapa: la parte de arriba, que sale despedida.
        g.with(mul(translate(0, -Math.round(p.cap / 2)), rotateAt(Math.round(p.capRot / 3) * 3, 32, 30)), () => {
          shell(g, 2, [[0, 0], [64, 0], [64, 38], ...[...ZIGZAG].reverse(), [0, 38]]);
        });
      } else {
        shell(g, 1);
      }
      g.outline();
      if (!p.open) {
        for (let k = 0; k < p.cracks; k++) {
          const c = CRACKS[k];
          for (let j = 0; j + 1 < c.length; j++) g.line(c[j][0], c[j][1], c[j + 1][0], c[j + 1][1], CRACK, 1);
        }
      }
    });
  }
  p.fx.filter((f) => !f.b).forEach((f) => drawFx(g, f));
  return g;
}
