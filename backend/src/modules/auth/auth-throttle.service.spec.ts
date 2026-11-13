import { AuthThrottleService } from './auth-throttle.service';

const cfg = (values: Record<string, unknown> = {}) => ({ get: (k: string) => values[k] }) as any;

/** Redis simulado mínimo (ZSET) para probar el camino compartido sin servidor real. */
function fakeRedis(failing = false) {
  const z = new Map<string, { score: number; member: string }[]>();
  const api = {
    zremrangebyscore: async (k: string, _a: number, max: number) => {
      z.set(k, (z.get(k) ?? []).filter((e) => e.score > max));
    },
    zcard: async (k: string) => (z.get(k) ?? []).length,
    multi: () => {
      const ops: (() => void)[] = [];
      const chain: any = {
        zadd: (k: string, score: number, member: string) => (ops.push(() => z.set(k, [...(z.get(k) ?? []), { score, member }])), chain),
        pexpire: () => chain,
        exec: async () => ops.forEach((o) => o()),
      };
      return chain;
    },
    del: async (k: string) => z.delete(k),
    keys: async () => [...z.keys()],
  };
  return {
    key: (n: string) => `t:${n}`,
    run: async (fn: (r: any) => Promise<any>) => (failing ? null : fn(api)),
    store: z,
  } as any;
}

describe('AuthThrottleService', () => {
  afterEach(() => jest.useRealTimers());

  it('en tests está desactivado salvo que se fuerce', async () => {
    const off = new AuthThrottleService(cfg({ NODE_ENV: 'test' }));
    for (let i = 0; i < 50; i++) await off.consume('k', 1, 60_000);
    const on = new AuthThrottleService(cfg({ NODE_ENV: 'test', AUTH_RATE_LIMIT_FORCE: 'true' }));
    await on.consume('k', 1, 60_000);
    await expect(on.consume('k', 1, 60_000)).rejects.toThrow();
  });

  it('AUTH_RATE_LIMIT_DISABLED lo apaga en cualquier entorno', async () => {
    const s = new AuthThrottleService(cfg({ NODE_ENV: 'development', AUTH_RATE_LIMIT_DISABLED: 'true' }));
    for (let i = 0; i < 50; i++) await s.consume('k', 1, 60_000);
  });

  describe.each([
    ['memoria', () => undefined],
    ['Redis', () => fakeRedis()],
    ['Redis caído (respaldo en memoria)', () => fakeRedis(true)],
  ])('activo con %s', (_name, redis) => {
    const make = (extra: Record<string, unknown> = {}) => new AuthThrottleService(cfg({ NODE_ENV: 'development', ...extra }), redis());

    it('bloquea al alcanzar el máximo con 429 y mensaje de reintento', async () => {
      const s = make();
      for (let i = 0; i < 3; i++) await s.consume('k', 3, 60_000);
      try {
        await s.consume('k', 3, 60_000);
        fail('debía lanzar');
      } catch (e: any) {
        expect(e.getStatus()).toBe(429);
        expect(e.getResponse()).toMatchObject({ retryAfterSeconds: 60 });
      }
    });

    it('assertBelow no registra intentos; add sí', async () => {
      const s = make();
      for (let i = 0; i < 10; i++) await s.assertBelow('k', 2, 60_000);
      await s.add('k', 60_000);
      await s.add('k', 60_000);
      await expect(s.assertBelow('k', 2, 60_000)).rejects.toThrow();
    });

    it('las claves son independientes y clear reinicia una', async () => {
      const s = make();
      await s.add('a', 60_000);
      await s.add('a', 60_000);
      await expect(s.assertBelow('a', 2, 60_000)).rejects.toThrow();
      await expect(s.assertBelow('b', 2, 60_000)).resolves.toBeUndefined();
      await s.clear('a');
      await expect(s.assertBelow('a', 2, 60_000)).resolves.toBeUndefined();
    });

    it('la ventana es deslizante: los intentos antiguos dejan de contar', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const s = make();
      await s.add('k', 60_000);
      await s.add('k', 60_000);
      await expect(s.assertBelow('k', 2, 60_000)).rejects.toThrow();
      jest.setSystemTime(new Date('2026-01-01T00:01:01Z'));
      await expect(s.assertBelow('k', 2, 60_000)).resolves.toBeUndefined();
    });

    it('los límites salen de la configuración con valores por defecto razonables', () => {
      expect(make().limits).toMatchObject({ loginFailsPerAccount: 10, loginFailsPerIp: 100, registerPerIp: 10, refreshPerIp: 60 });
      const custom = make({ AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT: 3, AUTH_LOGIN_WINDOW_MINUTES: 1 }).limits;
      expect(custom.loginFailsPerAccount).toBe(3);
      expect(custom.loginWindowMs).toBe(60_000);
      expect(make({ AUTH_REGISTER_MAX_PER_IP: 'abc' }).limits.registerPerIp).toBe(10);
    });
  });

  it('con Redis el contador se comparte entre instancias del servicio', async () => {
    const redis = fakeRedis();
    const a = new AuthThrottleService(cfg({ NODE_ENV: 'development' }), redis);
    const b = new AuthThrottleService(cfg({ NODE_ENV: 'development' }), redis);
    await a.add('k', 60_000);
    await a.add('k', 60_000);
    await expect(b.assertBelow('k', 2, 60_000)).rejects.toThrow();
  });
});
