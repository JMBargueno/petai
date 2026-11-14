import { runSimulate } from '../lib/battle-sim';

describe('petai-devkit simulate (offline, determinista — SC-005)', () => {
  it('mismo seed ⇒ output JSON idéntico byte a byte', () => {
    const a = runSimulate({ combats: 500, seed: 42 });
    const b = runSimulate({ combats: 500, seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('distinto seed ⇒ reporte distinto', () => {
    const a = runSimulate({ combats: 400, seed: 1 });
    const b = runSimulate({ combats: 400, seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('reporte incluye winRates (rareza/elemento), avgRounds y avgDamage', () => {
    const r = runSimulate({ combats: 300, seed: 7 });
    expect(r.total).toBe(300);
    expect(r.seed).toBe(7);
    expect(typeof r.winRates.byRarity).toBe('object');
    expect(typeof r.winRates.byElement).toBe('object');
    expect(Object.keys(r.winRates.byElement).length).toBeGreaterThan(0);
    expect(typeof r.avgRounds).toBe('number');
    expect(typeof r.avgDamage).toBe('number');
    for (const v of Object.values(r.winRates.byRarity)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('rechaza combats <= 0', () => {
    expect(() => runSimulate({ combats: 0, seed: 1 })).toThrow();
  });
});