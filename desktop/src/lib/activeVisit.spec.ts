import { describe, expect, it } from 'vitest';
import { ongoingVisitFrom, VISIT_MAX_AGE_MS } from './activeVisit';

const now = Date.parse('2026-11-18T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('ongoingVisitFrom', () => {
  it('devuelve el amigo de una visita al hábitat sin terminar', () => {
    const history = [
      { kind: 'care', direction: 'out', otherUserId: 'u-1', createdAt: ago(1000) },
      { kind: 'habitat', direction: 'out', otherUserId: 'u-2', endedAt: null, createdAt: ago(60_000) },
    ];
    expect(ongoingVisitFrom(history, now)).toBe('u-2');
  });

  it('ignora las terminadas, las recibidas y las que no informan de su fin', () => {
    const history = [
      { kind: 'habitat', direction: 'out', otherUserId: 'u-2', endedAt: ago(10), createdAt: ago(60_000) },
      { kind: 'habitat', direction: 'in', otherUserId: 'u-3', endedAt: null, createdAt: ago(60_000) },
      { kind: 'habitat', direction: 'out', otherUserId: 'u-4', createdAt: ago(60_000) },
    ];
    expect(ongoingVisitFrom(history, now)).toBe('');
  });

  it('no da por viva una visita muy antigua', () => {
    const history = [{ kind: 'habitat', direction: 'out', otherUserId: 'u-2', endedAt: null, createdAt: ago(VISIT_MAX_AGE_MS + 1) }];
    expect(ongoingVisitFrom(history, now)).toBe('');
  });

  it('con varias abiertas se queda con la más reciente', () => {
    const history = [
      { kind: 'habitat', direction: 'out', otherUserId: 'u-old', endedAt: null, createdAt: ago(120_000) },
      { kind: 'habitat', direction: 'out', otherUserId: 'u-new', endedAt: null, createdAt: ago(30_000) },
    ];
    expect(ongoingVisitFrom(history, now)).toBe('u-new');
  });
});
