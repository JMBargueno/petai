import { describe, it, expect } from 'vitest';
import {
  HABITAT_TIERS,
  MAX_RESIDENTS,
  GROUND,
  habitatTier,
  tierProgress,
  spawnWalkers,
  stepWalkers,
  celebrateAll,
  depthScale,
  type Walker,
} from './clan-habitat';

/** Generador pseudoaleatorio determinista para que los tests no dependan de la suerte. */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('clan-habitat: niveles', () => {
  it('5 niveles y 5 residentes como máximo', () => {
    expect(HABITAT_TIERS.map((t) => t.level)).toEqual([1, 2, 3, 4, 5]);
    expect(MAX_RESIDENTS).toBe(5);
  });

  it('cambia de nivel justo en el umbral', () => {
    expect(habitatTier(499).level).toBe(1);
    expect(habitatTier(500).level).toBe(2);
    expect(habitatTier(14999).level).toBe(4);
    expect(habitatTier(15000).level).toBe(5);
  });

  it('tierProgress: porcentaje dentro del tramo y XP restante', () => {
    expect(tierProgress(0)).toMatchObject({ percent: 0, remaining: 500 });
    expect(tierProgress(250)).toMatchObject({ percent: 50, remaining: 250 });
    expect(tierProgress(2000)).toMatchObject({ percent: 0, remaining: 4000 });
    expect(tierProgress(20000)).toMatchObject({ next: null, percent: 100, remaining: 0 });
    expect(tierProgress(-5).tier.level).toBe(1);
  });
});

describe('clan-habitat: paseo', () => {
  const inGround = (w: Walker) =>
    w.x >= GROUND.minX && w.x <= GROUND.maxX && w.y >= GROUND.minY && w.y <= GROUND.maxY;

  it('spawn reparte a todos dentro de la franja', () => {
    const ws = spawnWalkers(['a', 'b', 'c', 'd', 'e'], seeded());
    expect(ws).toHaveLength(5);
    expect(ws.every(inGround)).toBe(true);
    const xs = ws.map((w) => w.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
  });

  it('tras mucho tiempo nadie sale de la franja y todos han caminado', () => {
    const rng = seeded(7);
    let ws = spawnWalkers(['a', 'b', 'c', 'd', 'e'], rng);
    const start = ws.map((w) => w.x);
    const walked = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      ws = stepWalkers(ws, 50, new Set(), rng);
      expect(ws.every(inGround)).toBe(true);
      ws.forEach((w) => w.mode === 'walk' && walked.add(w.id));
    }
    expect(walked.size).toBe(5);
    expect(ws.some((w, i) => Math.abs(w.x - start[i]) > 0.01)).toBe(true);
  });

  it('los dormidos no se mueven', () => {
    const rng = seeded(3);
    let ws = spawnWalkers(['a', 'b'], rng);
    const x = ws[0].x;
    for (let i = 0; i < 500; i++) ws = stepWalkers(ws, 50, new Set(['a']), rng);
    expect(ws[0]).toMatchObject({ mode: 'sleep', x });
  });

  it('dos que se cruzan caminando se saludan mirándose', () => {
    const ws: Walker[] = [
      { id: 'a', x: 0.5, y: 0.5, tx: 0.9, ty: 0.5, mode: 'walk', timer: 0, facing: 1, emote: null, emoteKey: 0 },
      { id: 'b', x: 0.55, y: 0.5, tx: 0.1, ty: 0.5, mode: 'walk', timer: 0, facing: -1, emote: null, emoteKey: 0 },
    ];
    const [a, b] = stepWalkers(ws, 16, new Set(), seeded());
    expect(a.mode).toBe('emote');
    expect(b.mode).toBe('emote');
    expect(a.emote).toBe(b.emote);
    expect(a.facing).toBe(1);
    expect(b.facing).toBe(-1);
    expect(a.emoteKey).toBe(1);
  });

  it('celebrateAll pone a celebrar a todos menos a los dormidos', () => {
    const ws = spawnWalkers(['a', 'b'], seeded());
    ws[1] = { ...ws[1], mode: 'sleep' };
    const out = celebrateAll(ws, 'celebrate');
    expect(out[0]).toMatchObject({ mode: 'emote', emote: 'celebrate', emoteKey: 1 });
    expect(out[1].mode).toBe('sleep');
  });

  it('la profundidad agranda a los de delante', () => {
    expect(depthScale(0)).toBeLessThan(depthScale(1));
    expect(depthScale(1)).toBe(1);
  });
});
