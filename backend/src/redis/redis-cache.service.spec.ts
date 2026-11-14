import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService (R-04.4: caché de vida corta)', () => {
  function build(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial).map(([k, v]) => [`petai:test:${k}`, v]));
    let ttl: number | null = null;
    const api = {
      get: async (k: string) => (store.has(k) ? store.get(k) : null),
      set: async (k: string, v: string, _opt: string, t: number) => {
        store.set(k, v);
        ttl = t;
        return 'OK';
      },
    };
    const redis = { key: (n: string) => `petai:test:${n}`, run: async (fn: any) => fn(api) };
    return { svc: new RedisCacheService(redis as never), store, getTtl: () => ttl };
  }

  it('getOrSet cacha el resultado y lo sirve sin recalcular dentro del TTL', async () => {
    const { svc } = build();
    let calls = 0;
    const a = await svc.getOrSet('k', 10, async () => ({ v: ++calls }));
    const b = await svc.getOrSet('k', 10, async () => ({ v: ++calls }));
    expect(calls).toBe(1); // la factory solo se ejecuta una vez
    expect(a).toEqual({ v: 1 });
    expect(b).toEqual({ v: 1 });
  });

  it('set escribe con TTL (EX) en segundos', async () => {
    const { svc, getTtl } = build();
    await svc.set('k', { x: 1 }, 12);
    expect(getTtl()).toBe(12);
  });

  it('si Redis cae (run → null) recalcula sin lanzar', async () => {
    const redis = { key: (n: string) => n, run: jest.fn().mockResolvedValue(null) };
    const svc = new RedisCacheService(redis as never);
    const r = await svc.getOrSet('k', 10, async () => 'fresh');
    expect(r).toBe('fresh');
  });
});
