import { describe, expect, it } from 'vitest';
import balance from '../../game-data/balance.json';
import { digestView, foldEpisodes, groupOf, normalizeDigests, type ConsolidationConfig, type FoldableEpisode } from './consolidate';

const cfg = (balance as any).personality.memory.consolidation as ConsolidationConfig;
const ep = (o: Partial<FoldableEpisode> = {}): FoldableEpisode => ({ kind: 'encounter', subject: 'pet:brasa', valence: 0.6, at: 1000, ...o });

describe('consolidación de la memoria', () => {
  it('agrupa por con quién fue o por qué tipo de vivencia', () => {
    expect(groupOf(ep(), cfg)).toBe('sum:pet:brasa');
    expect(groupOf(ep({ kind: 'visit', subject: 'user:ana', key: 'visitor:v1' }), cfg)).toBe('sum:user:ana');
    expect(groupOf(ep({ kind: 'find', subject: null }), cfg)).toBe('sum:find');
  });

  it('no pliega lo nacido del chat, lo del entrenador ni lo que lleva otra clave', () => {
    expect(groupOf(ep({ kind: 'summary', subject: null }), cfg)).toBeNull();
    expect(groupOf(ep({ kind: 'event', subject: null }), cfg)).toBeNull();
    expect(groupOf(ep({ subject: 'owner' }), cfg)).toBeNull();
    expect(groupOf(ep({ subject: null }), cfg)).toBeNull();
    expect(groupOf(ep({ key: 'ep:love' }), cfg)).toBeNull();
    expect(groupOf(ep({ kind: 'find', subject: null, key: 'wish:explore' }), cfg)).toBeNull();
  });

  it('cuenta cada episodio una vez y lleva la media de cómo fueron', () => {
    const a = foldEpisodes({}, [ep({ valence: 1, at: 10 }), ep({ valence: 0, at: 30 })], cfg);
    expect(a.digests['sum:pet:brasa']).toEqual({ count: 2, valence: 0.5, firstAt: 10, lastAt: 30 });
    const b = foldEpisodes(a.digests, [ep({ valence: -1, at: 20 })], cfg);
    expect(b.digests['sum:pet:brasa']).toEqual({ count: 3, valence: 0, firstAt: 10, lastAt: 30 });
    expect(b.touched).toEqual(['sum:pet:brasa']);
    // No muta lo recibido
    expect(a.digests['sum:pet:brasa'].count).toBe(2);
  });

  it('con un solo episodio todavía no hay nada que resumir', () => {
    const { digests } = foldEpisodes({}, [ep()], cfg);
    expect(digestView('sum:pet:brasa', digests['sum:pet:brasa'], cfg)).toBeNull();
  });

  it('distingue varias de muchas y cómo fueron', () => {
    const many = Array.from({ length: cfg.manyFrom }, (_, i) => ep({ valence: 0.8, at: i }));
    const d = foldEpisodes({}, many, cfg).digests['sum:pet:brasa'];
    expect(digestView('sum:pet:brasa', d, cfg)).toMatchObject({ group: 'pet', subject: 'pet:brasa', amount: 'many', tone: 'good' });
    const few = foldEpisodes({}, [ep({ valence: -0.8 }), ep({ valence: -0.6 })], cfg).digests['sum:pet:brasa'];
    expect(digestView('sum:pet:brasa', few, cfg)).toMatchObject({ amount: 'some', tone: 'bad' });
    const finds = foldEpisodes({}, [ep({ kind: 'find', subject: null }), ep({ kind: 'find', subject: null })], cfg).digests['sum:find'];
    expect(digestView('sum:find', finds, cfg)).toMatchObject({ group: 'find', subject: null });
  });

  it('la importancia crece con lo vivido, con tope', () => {
    const d = foldEpisodes({}, Array.from({ length: 500 }, (_, i) => ep({ at: i })), cfg).digests['sum:pet:brasa'];
    expect(digestView('sum:pet:brasa', d, cfg)!.importance).toBe(cfg.importance.max);
  });

  it('no guarda más grupos de la cuenta: suelta aquellos de los que hace más que no pasa nada', () => {
    const eps = Array.from({ length: cfg.maxDigests + 3 }, (_, i) => ep({ subject: `pet:p${i}`, at: i }));
    const r = foldEpisodes({}, eps, cfg);
    expect(Object.keys(r.digests)).toHaveLength(cfg.maxDigests);
    expect(r.dropped).toEqual(['sum:pet:p0', 'sum:pet:p1', 'sum:pet:p2']);
    expect(r.touched).not.toContain('sum:pet:p0');
  });

  it('descarta lo guardado que no reconoce', () => {
    expect(normalizeDigests({ 'sum:find': { count: 3.7, valence: 9, firstAt: 1, lastAt: 2 }, otra: { count: 1, valence: 0, firstAt: 1, lastAt: 1 }, 'sum:x': { count: 'dos' }, 'sum:y': null })).toEqual({
      'sum:find': { count: 3, valence: 1, firstAt: 1, lastAt: 2 },
    });
    expect(normalizeDigests(null)).toEqual({});
  });
});
