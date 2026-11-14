import * as fs from 'fs';
import * as path from 'path';
import { simulateBalance, buildCombatConfig, createSimFighter } from './battle-sim';
import { createRng } from './rng';

function loadData() {
  const candidates = [
    path.resolve(process.cwd(), 'shared/game-data'),
    path.resolve(process.cwd(), '../shared/game-data'),
    path.resolve(__dirname, '../../../../shared/game-data'),
    path.resolve(__dirname, '../../../shared/game-data'),
  ];
  const dir = candidates.find((d) => fs.existsSync(d));
  if (!dir) throw new Error('shared/game-data no encontrado para battle-sim.spec');
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { balance: read('balance.json'), species: read('species.json'), skills: read('skills.json') };
}

describe('battle-sim (motor puro, determinista — constitución II)', () => {
  const { balance, species, skills } = loadData();

  it('no lee reloj/DB: misma seed ⇒ reporte idéntico byte a byte', () => {
    const a = simulateBalance({ species, skills, balance, combats: 250, seed: 42 });
    const b = simulateBalance({ species, skills, balance, combats: 250, seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('distinta seed ⇒ reporte distinto', () => {
    const a = simulateBalance({ species, skills, balance, combats: 500, seed: 1 });
    const b = simulateBalance({ species, skills, balance, combats: 500, seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('reporte expone winRates (rareza/elemento), avgRounds y avgDamage', () => {
    const r = simulateBalance({ species, skills, balance, combats: 300, seed: 7 });
    expect(r.total).toBe(300);
    expect(r.seed).toBe(7);
    expect(Object.keys(r.winRates.byRarity).length).toBeGreaterThan(0);
    expect(Object.keys(r.winRates.byElement).length).toBeGreaterThan(0);
    expect(typeof r.avgRounds).toBe('number');
    expect(typeof r.avgDamage).toBe('number');
    for (const v of Object.values(r.winRates.byRarity)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('rechaza combats inválidos (<= 0)', () => {
    expect(() => simulateBalance({ species, skills, balance, combats: 0, seed: 1 })).toThrow();
    expect(() => simulateBalance({ species, skills, balance, combats: -3, seed: 1 })).toThrow();
  });

  it('buildCombatConfig extrae los campos de balance.combats', () => {
    const cfg = buildCombatConfig(balance);
    expect(cfg.maxRounds).toBe(balance.combats.maxRounds);
    expect(cfg.critChance).toBe(balance.combats.critChance);
  });

  it('createSimFighter es determinista con un PRNG sembrado', () => {
    const ctx = { species, skills, balance };
    const f1 = createSimFighter(createRng(123), ctx, 0);
    const f2 = createSimFighter(createRng(123), ctx, 0);
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2));
  });
});