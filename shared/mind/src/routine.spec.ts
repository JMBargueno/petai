import { describe, expect, it } from 'vitest';
import balance from '../../game-data/balance.json';
import { advanceRoutine, emptyRoutine, isContinuing, isLongStretch, normalizeRoutine, phaseOf, routineFactor, type RoutineConfig } from './routine';

const cfg = (balance as any).personality.autonomy.routine as RoutineConfig;

describe('rutinas con continuidad', () => {
  it('cada hora tiene su momento del día, y la madrugada es noche', () => {
    expect(phaseOf(cfg.phaseStarts.morning, cfg)).toBe('morning');
    expect(phaseOf(cfg.phaseStarts.afternoon, cfg)).toBe('afternoon');
    expect(phaseOf(cfg.phaseStarts.evening, cfg)).toBe('evening');
    expect(phaseOf(cfg.phaseStarts.night, cfg)).toBe('night');
    expect(phaseOf(3, cfg)).toBe('night');
    expect(phaseOf(cfg.phaseStarts.morning - 1, cfg)).toBe('night');
    expect(phaseOf(27, cfg)).toBe('night');
    for (let h = 0; h < 24; h++) expect(['morning', 'afternoon', 'evening', 'night']).toContain(phaseOf(h, cfg));
  });

  it('de noche descansar pesa mucho más que explorar', () => {
    const none = emptyRoutine();
    expect(routineFactor('rest', 'night', none, 10, cfg)).toBeGreaterThan(routineFactor('explore', 'night', none, 10, cfg) * 10);
    expect(routineFactor('explore', 'morning', none, 10, cfg)).toBeGreaterThan(1);
  });

  it('lo que está haciendo tiende a seguir, hasta que se cansa', () => {
    let s = advanceRoutine(emptyRoutine(), 'explore', 10);
    expect(routineFactor('explore', 'afternoon', s, 11, cfg)).toBeCloseTo((cfg.phaseFactors.afternoon.explore ?? 1) * cfg.momentum.stay, 5);
    for (let i = 11; s.streak < cfg.momentum.maxStreak; i++) s = advanceRoutine(s, 'explore', i);
    expect(routineFactor('explore', 'afternoon', s, s.index! + 1, cfg)).toBeCloseTo((cfg.phaseFactors.afternoon.explore ?? 1) * cfg.momentum.tired, 5);
  });

  it('de descansar no se cansa', () => {
    let s = emptyRoutine();
    for (let i = 0; i < 12; i++) s = advanceRoutine(s, 'rest', i);
    expect(routineFactor('rest', 'night', s, 12, cfg)).toBeCloseTo(cfg.phaseFactors.night.rest * cfg.momentum.stay, 5);
  });

  it('después de explorar apetece más descansar', () => {
    const s = advanceRoutine(emptyRoutine(), 'explore', 10);
    expect(routineFactor('rest', 'afternoon', s, 11, cfg)).toBeCloseTo((cfg.phaseFactors.afternoon.rest ?? 1) * cfg.after.explore.rest, 5);
  });

  it('el hilo solo vale para la hora siguiente', () => {
    const s = advanceRoutine(emptyRoutine(), 'explore', 10);
    expect(isContinuing(s, 11)).toBe(true);
    expect(isContinuing(s, 12)).toBe(false);
    expect(routineFactor('explore', 'afternoon', s, 13, cfg)).toBe(cfg.phaseFactors.afternoon.explore ?? 1);
    expect(advanceRoutine(s, 'explore', 13).streak).toBe(1);
    expect(advanceRoutine(s, 'explore', 11).streak).toBe(2);
    expect(advanceRoutine(s, 'rest', 11)).toEqual({ last: 'rest', streak: 1, index: 11 });
  });

  it('un buen rato seguido se cuenta una sola vez por racha', () => {
    let s = emptyRoutine();
    const told: number[] = [];
    for (let i = 0; i < cfg.longFrom + 3; i++) {
      s = advanceRoutine(s, 'explore', i);
      if (isLongStretch(s, cfg)) told.push(i);
    }
    expect(told).toEqual([cfg.longFrom - 1]);
  });

  it('nunca anula una actividad y descarta lo guardado que no reconoce', () => {
    for (const phase of ['morning', 'afternoon', 'evening', 'night'] as const) {
      for (const a of Object.keys((balance as any).personality.autonomy.activities)) expect(routineFactor(a, phase, emptyRoutine(), 1, cfg)).toBeGreaterThan(0);
    }
    expect(normalizeRoutine({ last: 'explore', streak: 2.9, index: 7 })).toEqual({ last: 'explore', streak: 2, index: 7 });
    expect(normalizeRoutine({ last: 3, streak: 2, index: 7 })).toEqual(emptyRoutine());
    expect(normalizeRoutine({ last: 'explore', streak: 0, index: 7 })).toEqual(emptyRoutine());
    expect(normalizeRoutine(null)).toEqual(emptyRoutine());
  });
});
