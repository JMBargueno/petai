import { describe, expect, it } from 'vitest';
import type { HabitatVisitor } from './api';
import { dropGoneVisitor, syncShownVisitors } from './visitorsShown';

const visitor = (id: string): HabitatVisitor => ({
  visitorId: id,
  visitorName: id,
  pet: { petId: `p-${id}`, nickname: id, speciesName: 'Ignisaurio', speciesId: 'ignisaur', spriteRef: '' },
  startedAt: '2026-11-18T12:00:00Z',
});

describe('visitantes pintados', () => {
  it('los nuevos llegan y los que se van se quedan hasta cruzar su portal', () => {
    let shown = syncShownVisitors([], [visitor('a'), visitor('b')]);
    expect(shown.map((s) => [s.v.visitorId, s.leaving])).toEqual([['a', false], ['b', false]]);
    shown = syncShownVisitors(shown, [visitor('b')]);
    expect(shown.map((s) => [s.v.visitorId, s.leaving])).toEqual([['a', true], ['b', false]]);
    shown = dropGoneVisitor(shown, 'a');
    expect(shown.map((s) => s.v.visitorId)).toEqual(['b']);
  });

  it('si vuelve mientras se iba, deja de irse y no se borra al terminar el portal', () => {
    let shown = syncShownVisitors([], [visitor('a')]);
    shown = syncShownVisitors(shown, []);
    shown = syncShownVisitors(shown, [visitor('a')]);
    expect(shown).toEqual([{ v: visitor('a'), leaving: false }]);
    expect(dropGoneVisitor(shown, 'a')).toHaveLength(1);
  });
});
