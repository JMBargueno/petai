/**
 * Poses por animación y frame. `t` va de 0 a 1 a lo largo de la animación; `i` es el frame.
 * Las coordenadas de efectos (fx) están en el espacio del frame (128×128, suelo en y=120).
 */
import type { Fx } from './draw';
import { pose, Pose, SpeciesArt } from './species';

type PoseFn = (i: number, n: number, sp: SpeciesArt) => Pose;

const TAU = Math.PI * 2;
const pick = <T>(arr: T[], i: number): T => arr[Math.min(i, arr.length - 1)];

function zzz(i: number, n: number, sp: SpeciesArt): Fx[] {
  const [tx, ty] = sp.top;
  const out: Fx[] = [];
  for (let k = 0; k < 3; k++) {
    const ph = ((i + k * (n / 3)) % n) / n; // 0..1 subiendo
    out.push({ k: 'zzz', x: tx + 18 + ph * 10 + k * 2, y: ty + 8 - ph * 26, s: 0.5 + ph * 0.5, a: 1 - ph * 0.6 });
  }
  return out;
}

function sparkleRing(cx: number, cy: number, r: number, count: number, rot: number, a = 1): Fx[] {
  return Array.from({ length: count }, (_, k) => {
    const ang = rot + (k * TAU) / count;
    return { k: 'sparkle', x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.8, s: 0.8, a, r: (rot * 180) / Math.PI } as Fx;
  });
}

function confetti(i: number, count: number): Fx[] {
  return Array.from({ length: count }, (_, k) => {
    const x = 10 + ((k * 37) % 108);
    const y = ((k * 23 + i * 13) % 100) + 4;
    return { k: 'confetti', x, y, s: 1.1, r: (k * 47 + i * 30) % 180 } as Fx;
  });
}

export const POSES: Record<string, PoseFn> = {
  idle: (i, n) => {
    const b = Math.sin((i / n) * TAU);
    return pose({
      sy: 1 + 0.025 * b,
      sx: 1 - 0.018 * b,
      tail: 6 * b,
      app: 1 + 0.05 * b,
      appRot: 4 * b,
      armL: 4 * b,
      armR: -4 * b,
      eyes: i === 4 ? 'closed' : 'open',
    });
  },
  idle_alt: (i) =>
    pose({
      look: pick([-2.5, -2.5, 0, 2.5, 2.5, 0], i),
      rot: pick([-3, -5, 0, 3, 5, 0], i),
      eyes: i === 2 ? 'closed' : 'open',
      mouth: i === 3 || i === 4 ? 'o' : 'smile',
      armR: i === 3 || i === 4 ? 110 + (i - 3) * 20 : 0,
      tail: pick([0, 8, 0, -8, 0, 0], i),
    }),
  sleep: (i, n, sp) => {
    const b = Math.sin((i / n) * TAU);
    return pose({
      dy: 6,
      sy: 0.88 + 0.03 * b,
      sx: 1.06 - 0.02 * b,
      eyes: 'closed',
      mouth: 'o',
      app: 0.85,
      appRot: -10,
      armL: -10,
      armR: -10,
      sit: true,
      fx: zzz(i, n, sp),
    });
  },
  sick: (i, n, sp) => {
    const b = Math.sin((i / n) * TAU);
    return pose({
      rot: 4 * b,
      sy: 0.95,
      dy: 3,
      eyes: 'half',
      mouth: 'wavy',
      app: 0.8,
      appRot: -12,
      armL: -15,
      armR: -15,
      fx: [
        { k: 'sweat', x: sp.face.r[0] + 12, y: sp.face.r[1] - 10 + i * 2 },
        { k: 'swirl', x: sp.top[0], y: sp.top[1] - 2, r: i * 90, s: 1 },
      ],
    });
  },
  sad: (i, n) => {
    const b = Math.sin((i / n) * TAU);
    return pose({
      sy: 0.94,
      dy: 3,
      rot: -2 * b,
      eyes: 'sad',
      mouth: 'frown',
      armL: -20,
      armR: -20,
      app: 0.85,
      appRot: -10,
      tears: i >= 2 ? i - 1 : 0,
    });
  },
  hungry: (i, n, sp) => {
    const b = Math.sin((i / n) * TAU);
    return pose({
      sx: 1 + 0.03 * b,
      sy: 1 - 0.03 * b,
      eyes: i % 2 === 0 ? 'half' : 'open',
      mouth: i % 2 === 0 ? 'open' : 'flat',
      look: 2,
      armL: -10,
      armR: 30,
      fx: [
        { k: 'thought', x: sp.top[0] + 22, y: sp.top[1] + 2 - (i % 2) * 2, s: 0.9 },
        { k: 'speed', x: 34, y: 100 + (i % 2) * 2, s: 0.5, a: 0.7 },
        { k: 'speed', x: 28, y: 104 - (i % 2) * 2, s: 0.4, a: 0.7 },
      ],
    });
  },
  tired: (i, n, sp) =>
    pose({
      sy: 0.94,
      dy: 3,
      eyes: pick(['half', 'closed', 'half', 'half'] as const, i),
      mouth: pick(['flat', 'yawn', 'yawn', 'flat'] as const, i),
      armL: -15,
      armR: i === 1 || i === 2 ? 60 : -10,
      app: 0.9,
      appRot: -6,
      fx: i >= 1 ? [{ k: 'zzz', x: sp.top[0] + 20, y: sp.top[1] + 4 - i * 3, s: 0.55, a: 0.8 }] : [],
    }),
  walk: (i, n) => {
    const ph = (i / n) * TAU;
    const s = Math.sin(ph);
    return pose({
      dy: -Math.abs(s) * 5,
      leg: s,
      armL: 25 * s,
      armR: -25 * s,
      rot: 3 * s,
      tail: 12 * s,
      app: 1 + 0.06 * s,
      appRot: 6 * s,
    });
  },
  perch: (i, n) => {
    const s = Math.sin((i / n) * TAU);
    return pose({
      sit: true,
      sy: 0.93,
      dy: 2,
      leg: s,
      tail: 10 * s,
      eyes: i === 2 ? 'happy' : 'open',
      mouth: 'smile',
      armL: 10,
      armR: 20 + 10 * s,
    });
  },
  climb: (i, n, sp) => {
    const s = Math.sin((i / n) * TAU);
    return pose({
      armL: 100 + 25 * s,
      armR: 100 - 25 * s,
      leg: s,
      sy: 1.05,
      sx: 0.96,
      mouth: 'flat',
      tail: 8 * s,
      fx: i === 2 ? [{ k: 'sweat', x: sp.face.r[0] + 12, y: sp.face.r[1] - 8 }] : [],
    });
  },
  fall: (i) =>
    pose({
      sx: 0.92,
      sy: 1.08,
      armL: 130 + (i % 2) * 15,
      armR: 140 - (i % 2) * 15,
      leg: i % 2 ? 1 : -1,
      eyes: 'wide',
      mouth: 'open',
      tail: i % 2 ? 15 : -15,
      app: 1.15,
      appRot: i % 2 ? 12 : -12,
      fx: [
        { k: 'speed', x: 30, y: 4 + i * 4, a: 0.8 },
        { k: 'speed', x: 98, y: 10 + i * 4, a: 0.8 },
        { k: 'speed', x: 64, y: 0 + i * 3, a: 0.6 },
      ],
    }),
  drag: (i, n, sp) => {
    const s = Math.sin((i / n) * TAU);
    return pose({
      dy: -4,
      sx: 0.9,
      sy: 1.12,
      rot: 4 * s,
      armL: 150,
      armR: 150,
      leg: s,
      tail: 18 * s,
      eyes: i === 2 ? 'closed' : 'wide',
      mouth: 'o',
      app: 1.1,
      appRot: 10 * s,
      fx: [{ k: 'sweat', x: sp.face.r[0] + 13, y: sp.face.r[1] - 10 }],
    });
  },
  land: (i) =>
    pick(
      [
        pose({ sx: 1.2, sy: 0.8, eyes: 'closed', mouth: 'flat', armL: 60, armR: 60, fx: [{ k: 'puff', x: 22, y: 116, s: 1.2 }, { k: 'puff', x: 100, y: 116, s: 1.2 }] }),
        pose({ sx: 1.1, sy: 0.9, eyes: 'closed', mouth: 'smile', armL: 30, armR: 30, fx: [{ k: 'puff', x: 14, y: 112, s: 1, a: 0.7 }, { k: 'puff', x: 108, y: 112, s: 1, a: 0.7 }] }),
        pose({ sx: 0.95, sy: 1.06, eyes: 'open', fx: [{ k: 'puff', x: 8, y: 108, s: 0.8, a: 0.4 }, { k: 'puff', x: 114, y: 108, s: 0.8, a: 0.4 }] }),
        pose({}),
      ],
      i,
    ),
  summon: (i, n, sp) => {
    const s = pick([0.2, 0.55, 1.2, 0.92, 1.05, 1], i);
    return pose({
      sx: s,
      sy: s,
      eyes: i < 3 ? 'closed' : i === 3 ? 'happy' : 'open',
      mouth: 'grin',
      armL: 80,
      armR: 80,
      fx: [
        ...sparkleRing(64, 80, 24 + i * 7, 6, i * 0.5, 1 - i / (n + 1)),
        ...(i < 3 ? [{ k: 'glow', x: 64, y: 86, r: 20 + i * 8, a: 0.45 - i * 0.12, b: true } as Fx] : []),
      ],
    });
  },
  talk: (i) =>
    pose({
      mouth: pick(['open', 'smile', 'o', 'flat'] as const, i),
      dy: i % 2 ? -1 : 0,
      armR: pick([10, 60, 40, 10], i),
      rot: pick([0, 2, 0, -1], i),
    }),
  happy: (i, n, sp) => {
    const dy = pick([0, -9, -15, -9, 0, 0], i);
    const air = dy < 0;
    return pose({
      dy,
      sx: i === 0 || i === 4 ? 1.12 : i === 2 ? 0.94 : 1,
      sy: i === 0 || i === 4 ? 0.88 : i === 2 ? 1.08 : 1,
      eyes: 'happy',
      mouth: 'grin',
      blush: true,
      armL: air ? 120 : 30,
      armR: air ? 130 : 30,
      tail: air ? 20 : 0,
      app: air ? 1.12 : 1,
      fx: i >= 1 && i <= 3 ? [{ k: 'sparkle', x: 22, y: 34 - i * 2 }, { k: 'sparkle', x: 108, y: 28 - i * 2, s: 0.7 }] : [],
    });
  },
  love: (i, n) => {
    const s = Math.sin((i / n) * TAU);
    return pose({
      rot: 5 * s,
      eyes: i >= 1 && i <= 4 ? 'heart' : 'happy',
      mouth: 'smile',
      blush: true,
      armL: 50,
      armR: 50,
      tail: 10 * s,
      fx: [
        { k: 'heart', x: 100, y: 44 - i * 5, s: 0.8 + i * 0.05, a: 1 - i / 8 },
        { k: 'heart', x: 26, y: 54 - ((i + 3) % n) * 5, s: 0.7, a: 0.9 },
      ],
    });
  },
  dance: (i, n) => {
    const ph = (i / n) * TAU;
    return pose({
      rot: 12 * Math.sin(ph),
      dx: 5 * Math.sin(ph),
      dy: -Math.abs(Math.sin(ph * 2)) * 5,
      armL: i % 4 < 2 ? 140 : 0,
      armR: i % 4 < 2 ? 0 : 140,
      leg: Math.sin(ph * 2),
      eyes: 'happy',
      mouth: 'grin',
      tail: 18 * Math.sin(ph),
      fx: [
        { k: 'note', x: 104, y: 30 - (i % 4) * 4 },
        { k: 'note', x: 22, y: 40 - ((i + 2) % 4) * 4, c: '#ff5d8f' },
      ],
    });
  },
  cry: (i) =>
    pose({
      eyes: 'cry',
      mouth: i % 2 ? 'open' : 'wavy',
      sy: 1 + (i % 2 ? 0.03 : -0.02),
      dy: i % 2 ? 0 : 1,
      armL: 20,
      armR: i % 2 ? 90 : 70,
      tears: 1 + (i % 3),
      app: 0.85,
      appRot: -10,
      fx: [
        { k: 'drop', x: i % 2 ? 40 : 94, y: 116, s: 0.8, a: 0.7 },
        { k: 'drop', x: i % 2 ? 98 : 36, y: 108, s: 0.6, a: 0.5 },
      ],
    }),
  eat: (i) => {
    const chew = i % 2 === 1;
    const done = i === 7;
    return pose({
      food: done ? -1 : Math.floor(i / 2),
      mouth: done ? 'smile' : chew ? 'chew' : 'open',
      eyes: i >= 6 ? 'happy' : 'open',
      blush: done,
      dy: chew ? 1 : 0,
      sx: chew ? 1.04 : 1,
      sy: chew ? 0.97 : 1,
      armR: done ? 20 : 75,
      fx: chew ? [{ k: 'crumb', x: 100, y: 96 }, { k: 'crumb', x: 106, y: 104, s: 0.8 }] : [],
    });
  },
  clean: (i) => {
    const bubbles: Fx[] = [
      { k: 'bubble', x: 28 + ((i * 5) % 14), y: 70 - i * 4 },
      { k: 'bubble', x: 100 - ((i * 3) % 10), y: 60 - ((i + 3) % 8) * 4, s: 0.8 },
      { k: 'bubble', x: 60 + ((i * 7) % 12), y: 30 - ((i + 5) % 8) * 2, s: 0.6 },
    ];
    const shake = i >= 4;
    return pose({
      rot: pick([-8, 8, -8, 8, -12, 12, 0, 0], i),
      eyes: shake ? 'closed' : 'happy',
      mouth: 'smile',
      armL: 60,
      armR: 60,
      tail: pick([-15, 15, -15, 15, -20, 20, 0, 0], i),
      fx: [
        ...bubbles,
        ...(shake && i < 7 ? [{ k: 'drop', x: 14, y: 70 - i * 2 } as Fx, { k: 'drop', x: 114, y: 76 - i * 2 } as Fx] : []),
        ...(i === 7 ? [{ k: 'sparkle', x: 30, y: 50 } as Fx, { k: 'sparkle', x: 100, y: 40, s: 0.8 } as Fx] : []),
      ],
    });
  },
  heal: (i, n) =>
    pose({
      sy: 1 + 0.03 * Math.sin((i / n) * TAU),
      eyes: 'happy',
      mouth: 'smile',
      blush: i >= 3,
      armL: 40,
      armR: 40,
      fx: [
        { k: 'glow', x: 64, y: 88, r: 30 + i, a: 0.22, c: '#9dffc9', b: true },
        { k: 'plus', x: 26, y: 92 - i * 9, a: 1 - i / 8 },
        { k: 'plus', x: 104, y: 82 - ((i + 3) % n) * 9, s: 0.8, a: 0.9 },
      ],
    }),
  wake: (i, n, sp) =>
    pick(
      [
        pose({ sy: 0.9, dy: 4, eyes: 'closed', mouth: 'o', sit: true }),
        pose({ sy: 1.04, eyes: 'closed', mouth: 'yawn', armL: 60, armR: 60 }),
        pose({ sy: 1.12, sx: 0.94, eyes: 'closed', mouth: 'yawn', armL: 150, armR: 150, app: 1.15 }),
        pose({ sy: 1.12, sx: 0.94, eyes: 'half', mouth: 'yawn', armL: 160, armR: 160, app: 1.15, fx: [{ k: 'sparkle', x: sp.top[0] + 16, y: sp.top[1], s: 0.6 }] }),
        pose({ sy: 1, eyes: 'half', mouth: 'flat', armL: 20, armR: 20 }),
        pose({ eyes: 'open', mouth: 'smile', fx: [{ k: 'exclaim', x: sp.top[0] + 18, y: sp.top[1] + 4, s: 0.7 }] }),
      ],
      i,
    ),
  surprised: (i, n, sp) =>
    pick(
      [
        pose({ sx: 1.1, sy: 0.9, eyes: 'wide', mouth: 'o' }),
        pose({ dy: -12, sx: 0.9, sy: 1.12, eyes: 'wide', mouth: 'o', armL: 120, armR: 120, app: 1.2, fx: [{ k: 'exclaim', x: sp.top[0] + 20, y: sp.top[1] }] }),
        pose({ dy: -6, sx: 0.96, sy: 1.04, eyes: 'wide', mouth: 'o', armL: 90, armR: 90, fx: [{ k: 'exclaim', x: sp.top[0] + 20, y: sp.top[1] + 2 }] }),
        pose({ eyes: 'wide', mouth: 'open', fx: [{ k: 'exclaim', x: sp.top[0] + 20, y: sp.top[1] + 4, a: 0.6 }] }),
      ],
      i,
    ),
  celebrate: (i) => {
    const dy = pick([0, -10, -16, -8, 0, -10, -16, -8], i);
    const air = dy < 0;
    return pose({
      dy,
      sx: dy === 0 ? 1.1 : 0.95,
      sy: dy === 0 ? 0.9 : 1.06,
      armL: air ? 150 : 80,
      armR: air ? 150 : 80,
      eyes: 'star',
      mouth: 'grin',
      tail: air ? 20 : -10,
      app: air ? 1.15 : 1,
      fx: confetti(i, 12),
    });
  },
  attack: (i) =>
    pick(
      [
        pose({ dx: -6, rot: -10, sx: 0.92, eyes: 'angry', mouth: 'flat', armR: -20, tail: 15 }),
        pose({ dx: -9, rot: -12, sx: 0.9, sy: 1.04, eyes: 'angry', mouth: 'flat', armR: -30, tail: 20 }),
        pose({ dx: 14, rot: 10, sx: 1.15, sy: 0.9, eyes: 'angry', mouth: 'open', armR: 90, tail: -15 }),
        pose({ dx: 16, rot: 8, sx: 1.12, sy: 0.92, eyes: 'angry', mouth: 'grin', armR: 90, fx: [{ k: 'impact', x: 120, y: 74, s: 1 }] }),
        pose({ dx: 6, rot: 4, eyes: 'angry', mouth: 'grin', armR: 40, fx: [{ k: 'impact', x: 122, y: 74, s: 0.6, a: 0.7, r: -60 }] }),
        pose({ eyes: 'open', mouth: 'grin' }),
      ],
      i,
    ),
  hit: (i, n, sp) =>
    pick(
      [
        pose({ dx: -10, rot: -14, eyes: 'x', mouth: 'o', armL: 60, armR: 60, fx: [{ k: 'impact', x: sp.face.r[0] + 14, y: sp.face.r[1] - 8, s: 1 }] }),
        pose({ dx: -8, rot: -10, eyes: 'x', mouth: 'wavy', armL: 40, armR: 40, fx: [{ k: 'impact', x: sp.face.r[0] + 16, y: sp.face.r[1] - 10, s: 0.6, a: 0.7, r: -60 }] }),
        pose({ dx: -3, rot: -4, eyes: 'sad', mouth: 'wavy' }),
        pose({ eyes: 'open', mouth: 'flat' }),
      ],
      i,
    ),
  victory: (i, n, sp) => {
    const dy = pick([0, -14, -20, -14, 0, 0, 0, 0], i);
    const stars: Fx[] = i >= 5 ? [{ k: 'star', x: 20, y: 30 + (i % 2) * 3, s: 0.8 }, { k: 'star', x: 108, y: 24 - (i % 2) * 3, s: 1 }] : [];
    return pose({
      dy,
      sx: i === 0 ? 1.1 : i === 4 ? 1.12 : 1,
      sy: i === 0 ? 0.88 : i === 4 ? 0.88 : 1,
      eyes: i === 0 ? 'happy' : 'star',
      mouth: 'grin',
      armR: i === 0 ? 20 : 160,
      armL: i === 0 ? 20 : i >= 5 ? 40 : 120,
      tail: dy < 0 ? 18 : 6,
      blush: i >= 5,
      fx: [...stars, ...(i >= 1 && i <= 3 ? [{ k: 'sparkle', x: sp.top[0], y: sp.top[1] - 4 } as Fx] : [])],
    });
  },
  defeat: (i, n, sp) =>
    pose({
      rot: pick([-4, -8, -12, -14, -14, -14], i),
      sy: pick([0.98, 0.95, 0.9, 0.87, 0.86, 0.86], i),
      dy: pick([1, 2, 4, 6, 6, 6], i),
      eyes: i < 2 ? 'sad' : 'x',
      mouth: i < 2 ? 'frown' : 'wavy',
      armL: -25,
      armR: -25,
      app: 0.8,
      appRot: -15,
      tears: i === 1 ? 1 : 0,
      fx: i >= 2 ? [{ k: 'swirl', x: sp.top[0], y: sp.top[1] + 4, r: i * 80 }] : [],
    }),
  level_up: (i, n) => {
    const dy = pick([0, -6, -12, -16, -12, -6, 0, 0], i);
    return pose({
      dy,
      armL: dy < 0 ? 140 : 40,
      armR: dy < 0 ? 150 : 40,
      eyes: 'star',
      mouth: 'grin',
      blush: true,
      app: 1 + (dy < 0 ? 0.15 : 0),
      fx: [
        { k: 'ring', x: 64, y: 84, r: 16 + i * 5, a: Math.max(0, 1 - i / n) },
        { k: 'arrow', x: 108, y: 48 - i * 3, s: 0.9 },
        ...sparkleRing(64, 70, 42, 4, i * 0.4, 0.9),
      ],
    });
  },
  evolution: (i, n) => {
    const s = pick([1, 1.05, 0.95, 1.1, 0.9, 1.15, 1.15, 1.15, 1.05, 1], i);
    const glow = pick([0.1, 0.2, 0.3, 0.45, 0.6, 0.85, 1, 0.85, 0.4, 0], i);
    return pose({
      sx: s,
      sy: s,
      eyes: i < 8 ? 'closed' : 'happy',
      mouth: i < 8 ? 'flat' : 'grin',
      armL: 60 + i * 6,
      armR: 60 + i * 6,
      app: 1 + i * 0.03,
      fx: [
        ...sparkleRing(64, 78, 44 - (i % 5) * 4, 6, i * 0.6, 0.9),
        { k: 'ring', x: 64, y: 82, r: 26 + ((i * 5) % 24), a: 0.7, c: '#ffffff' },
        { k: 'glow', x: 64, y: 84, r: 48, a: glow },
      ],
    });
  },
};
