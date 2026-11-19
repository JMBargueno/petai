import { describe, expect, it } from 'vitest';
import balance from '../../game-data/balance.json';
import { creditTarget, emptyLearned, learnedFactor, normalizeLearned, reinforce, settleLearned, strongestPrefs, type LearningConfig } from './learning';

const cfg = (balance as any).personality.learning as LearningConfig;
const T0 = Date.UTC(2026, 10, 19, 10);
const DAY = 86_400_000;

describe('aprendizaje por refuerzo', () => {
  it('premiar una conducta la hace más probable, sin pasarse nunca del tope', () => {
    let l = emptyLearned(T0);
    const big = { ...cfg, dailyCap: 10_000 };
    for (let i = 0; i < 500; i++) l = reinforce(l, 'dance', 'pet', T0 + i * 1000, big).state;
    expect(l.prefs.dance).toBeGreaterThan(0.9);
    expect(l.prefs.dance).toBeLessThanOrEqual(1);
    expect(learnedFactor(l.prefs, 'dance', cfg)).toBeLessThanOrEqual(cfg.factor.max);
    expect(learnedFactor(l.prefs, 'stroll', cfg)).toBe(1);
  });

  it('lo que no le gusta baja, pero nunca desaparece', () => {
    let l = emptyLearned(T0);
    const big = { ...cfg, dailyCap: 10_000 };
    for (let i = 0; i < 500; i++) l = reinforce(l, 'climb', 'pickup', T0 + i * 1000, big).state;
    expect(l.prefs.climb).toBeLessThan(0);
    const f = learnedFactor(l.prefs, 'climb', cfg);
    expect(f).toBeGreaterThanOrEqual(cfg.factor.min);
    expect(f).toBeLessThan(1);
  });

  it('respeta el tope diario y lo reinicia al día siguiente', () => {
    let l = emptyLearned(T0);
    let applied = 0;
    for (let i = 0; i < cfg.dailyCap + 20; i++) {
      const r = reinforce(l, 'dance', 'pet', T0 + i * 1000, cfg);
      l = r.state;
      if (r.applied) applied++;
      else expect(r.reason).toBe('daily_cap');
    }
    expect(applied).toBe(cfg.dailyCap);
    expect(reinforce(l, 'dance', 'pet', T0 + DAY, cfg).applied).toBe(true);
  });

  it('una señal desconocida no hace nada', () => {
    const r = reinforce(emptyLearned(T0), 'dance', 'hackeo', T0, cfg);
    expect(r).toMatchObject({ applied: false, reason: 'unknown_signal' });
    expect(r.state.prefs).toEqual({});
  });

  it('se olvida con el tiempo: a la vida media queda la mitad y al final, nada', () => {
    const l = { prefs: { dance: 0.8 }, at: T0, day: null, count: 0 };
    expect(settleLearned(l, T0 + cfg.halfLifeDays * DAY, cfg).prefs.dance).toBeCloseTo(0.4, 2);
    expect(settleLearned(l, T0 + cfg.halfLifeDays * DAY * 12, cfg).prefs.dance).toBeUndefined();
  });

  it('no guarda más conductas de la cuenta y descarta lo que no reconoce', () => {
    let l = emptyLearned(T0);
    const small = { ...cfg, maxEntries: 3, dailyCap: 100 };
    for (const id of ['a', 'b', 'c', 'd', 'e']) l = reinforce(l, id, 'pet', T0, small).state;
    expect(Object.keys(l.prefs)).toHaveLength(3);
    expect(l.prefs.e).toBeDefined();
    expect(normalizeLearned({ prefs: { dance: 7, x: 'no', raro: 0.3 }, at: 'ayer' }, ['dance']).prefs).toEqual({ dance: 1 });
    expect(normalizeLearned(null)).toEqual(emptyLearned(0));
  });

  it('atribuye el gesto a lo que hace o acaba de hacer, no a lo de hace un rato', () => {
    expect(creditTarget('dance', { id: 'stroll', at: T0 }, T0, cfg)).toBe('dance');
    expect(creditTarget(null, { id: 'stroll', at: T0 }, T0 + cfg.creditWindowMs, cfg)).toBe('stroll');
    expect(creditTarget(null, { id: 'stroll', at: T0 }, T0 + cfg.creditWindowMs + 1, cfg)).toBeNull();
    expect(creditTarget(null, null, T0, cfg)).toBeNull();
  });

  it('enseña solo lo que ya es apreciable, de más a menos', () => {
    expect(strongestPrefs({ a: 0.05, b: -0.6, c: 0.3 }, 5)).toEqual([
      { id: 'b', value: -0.6 },
      { id: 'c', value: 0.3 },
    ]);
  });
});
