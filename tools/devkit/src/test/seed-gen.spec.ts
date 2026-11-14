import { buildSeedPlan, parseLevelRange } from '../lib/seed-gen';
import { loadGameData } from '../lib/game-data';

describe('petai-devkit seed-gen (offline)', () => {
  const { species } = loadGameData();

  it('distribución por nivel y rareza suma al total de pets', () => {
    const plan = buildSeedPlan({ users: 10, pets: 200, level: { min: 1, max: 50 }, seed: 99 }, species);
    const totalByRarity = Object.values(plan.distribution.byRarity).reduce((a, b) => a + b, 0);
    const totalByLevel = Object.values(plan.distribution.byLevel).reduce((a, b) => a + b, 0);
    expect(totalByRarity).toBe(200);
    expect(totalByLevel).toBe(200);
  });

  it('niveles siempre dentro del rango pedido', () => {
    const plan = buildSeedPlan({ users: 0, pets: 100, level: { min: 10, max: 20 }, seed: 5 }, species);
    for (const lvl of Object.keys(plan.distribution.byLevel)) {
      const n = Number(lvl);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(20);
    }
  });

  it('es determinista con seed fija (el --dry-run no toca red/DB)', () => {
    const a = buildSeedPlan({ users: 1, pets: 50, level: { min: 1, max: 100 }, seed: 123 }, species);
    const b = buildSeedPlan({ users: 1, pets: 50, level: { min: 1, max: 100 }, seed: 123 }, species);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('parseLevelRange maneja range(min,max), min-max y validación', () => {
    expect(parseLevelRange('range(1,100)')).toEqual({ min: 1, max: 100 });
    expect(parseLevelRange('5-20')).toEqual({ min: 5, max: 20 });
    expect(() => parseLevelRange('range(10,5)')).toThrow();
    expect(() => parseLevelRange('range(0,5)')).toThrow();
  });
});