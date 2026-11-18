/** Poses del huevo: balanceo, temblor, grietas y eclosión. El dibujo está en `pixel/egg.ts`. */
import type { Fx } from './draw';

export interface EggPose {
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
