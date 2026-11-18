import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UTILITY,
  bandOf,
  createRng,
  hashSeed,
  neutralDims,
  pushRecent,
  rngInt,
  rollBirthDims,
  scoreCandidates,
  selectByUtility,
  weighted,
  type BandTable,
  type Dims,
  type UtilityCandidate,
} from './index';

const CANDIDATES: UtilityCandidate[] = [
  { id: 'pasear', base: 3 },
  { id: 'correr', base: 1, weights: { temper: 0.05 } },
  { id: 'asomarse', base: 1, weights: { curiosity: 0.05 } },
  { id: 'sentarse', base: 1, weights: { temper: -0.04 } },
];

function run(dims: Dims, seed: string, turns: number, candidates = CANDIDATES) {
  const rng = createRng(hashSeed(seed));
  let recent: string[] = [];
  const lastAt: Record<string, number> = {};
  const picks: string[] = [];
  for (let i = 0; i < turns; i++) {
    const now = i * 1000;
    const id = selectByUtility({ candidates, dims, recent, lastAt, now, rng, cfg: DEFAULT_UTILITY });
    if (!id) break;
    picks.push(id);
    recent = pushRecent(recent, id, DEFAULT_UTILITY.window);
    lastAt[id] = now;
  }
  return picks;
}

const count = (picks: string[], id: string) => picks.filter((p) => p === id).length;

describe('generador sembrado', () => {
  it('la misma semilla da la misma secuencia', () => {
    const a = createRng(hashSeed('pockai'));
    const b = createRng(hashSeed('pockai'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('rngInt respeta los límites', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const n = rngInt(rng, 2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

describe('dimensiones', () => {
  it('weighted suma el peso por cada punto de diferencia con 50 y respeta el suelo', () => {
    expect(weighted(1, { temper: 0.05 }, { ...neutralDims(), temper: 90 })).toBeCloseTo(3);
    expect(weighted(1, { temper: 0.05 }, { ...neutralDims(), temper: 0 })).toBe(0.1);
    expect(weighted(2, undefined, neutralDims())).toBe(2);
  });

  it('bandOf devuelve la banda del valor y la última si se pasa', () => {
    const bands = [
      { max: 30, keyword: 'baja', label: 'Baja' },
      { max: 100, keyword: 'alta', label: 'Alta' },
    ];
    const table = { curiosity: { bands } } as unknown as BandTable;
    expect(bandOf('curiosity', 30, table).keyword).toBe('baja');
    expect(bandOf('curiosity', 31, table).keyword).toBe('alta');
    expect(bandOf('curiosity', 150, table).keyword).toBe('alta');
  });

  it('rollBirthDims es determinista y da enteros dentro de 0-100', () => {
    const birth = { variance: 15, defaultBias: 50 };
    const a = rollBirthDims({ bravery: 95 }, 1234, birth);
    expect(a).toEqual(rollBirthDims({ bravery: 95 }, 1234, birth));
    for (const v of Object.values(a)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('selector por utilidad', () => {
  it('la misma entrada da la misma decisión', () => {
    expect(run(neutralDims(), 'a', 40)).toEqual(run(neutralDims(), 'a', 40));
  });

  it('dos personalidades opuestas se comportan distinto', () => {
    const nervioso = run({ ...neutralDims(), temper: 95 }, 's', 400);
    const calmado = run({ ...neutralDims(), temper: 5 }, 's', 400);
    expect(count(nervioso, 'correr')).toBeGreaterThan(count(calmado, 'correr') * 2);
    expect(count(calmado, 'sentarse')).toBeGreaterThan(count(nervioso, 'sentarse') * 2);
  });

  it('no repite la misma conducta más de dos veces seguidas', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const picks = run(neutralDims(), seed, 200);
      for (let i = 2; i < picks.length; i++) {
        expect(picks[i] === picks[i - 1] && picks[i] === picks[i - 2], `${seed}@${i}`).toBe(false);
      }
    }
  });

  it('si solo hay una conducta posible, la repite antes que quedarse sin nada', () => {
    const picks = run(neutralDims(), 'solo', 5, [{ id: 'pasear', base: 1 }]);
    expect(picks).toEqual(['pasear', 'pasear', 'pasear', 'pasear', 'pasear']);
  });

  it('respeta el enfriamiento de cada conducta', () => {
    const candidates: UtilityCandidate[] = [
      { id: 'pasear', base: 1 },
      { id: 'saludo', base: 50, cooldownMs: 10_000 },
    ];
    const picks = run(neutralDims(), 'x', 30, candidates);
    const at = picks.map((p, i) => (p === 'saludo' ? i : -1)).filter((i) => i >= 0);
    expect(at.length).toBeGreaterThan(1);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(10);
  });

  it('descarta las candidatas con factor 0 y devuelve null si no queda ninguna', () => {
    const base = { dims: neutralDims(), recent: [], lastAt: {}, now: 0, cfg: DEFAULT_UTILITY };
    const scored = scoreCandidates({
      ...base,
      candidates: [
        { id: 'a', base: 1, factor: 0 },
        { id: 'b', base: 1 },
      ],
    });
    expect(scored.map((s) => s.id)).toEqual(['b']);
    expect(
      selectByUtility({ ...base, rng: createRng(1), candidates: [{ id: 'a', base: 1, factor: 0 }] }),
    ).toBeNull();
  });

  it('mantiene la conducta en curso si ninguna la supera por el margen', () => {
    const base = { dims: neutralDims(), recent: [], lastAt: {}, now: 0, cfg: DEFAULT_UTILITY };
    const close = [
      { id: 'a', base: 1.1 },
      { id: 'b', base: 1 },
    ];
    for (let seed = 0; seed < 20; seed++) {
      expect(selectByUtility({ ...base, rng: createRng(seed), candidates: close, current: 'b' })).toBe('b');
    }
    // Con una ventaja clara la conducta en curso deja de estar garantizada
    const far = [
      { id: 'a', base: 50 },
      { id: 'b', base: 1 },
    ];
    const picks = Array.from({ length: 20 }, (_, seed) =>
      selectByUtility({ ...base, rng: createRng(seed), candidates: far, current: 'b' }),
    );
    expect(picks).toContain('a');
  });
});
