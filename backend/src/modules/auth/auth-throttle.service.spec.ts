import { AuthThrottleService } from './auth-throttle.service';

const cfg = (values: Record<string, unknown> = {}) => ({ get: (k: string) => values[k] }) as any;

describe('AuthThrottleService', () => {
  afterEach(() => jest.useRealTimers());

  it('en tests está desactivado salvo que se fuerce', () => {
    const off = new AuthThrottleService(cfg({ NODE_ENV: 'test' }));
    for (let i = 0; i < 50; i++) off.consume('k', 1, 60_000);
    const on = new AuthThrottleService(cfg({ NODE_ENV: 'test', AUTH_RATE_LIMIT_FORCE: 'true' }));
    on.consume('k', 1, 60_000);
    expect(() => on.consume('k', 1, 60_000)).toThrow();
  });

  it('AUTH_RATE_LIMIT_DISABLED lo apaga en cualquier entorno', () => {
    const s = new AuthThrottleService(cfg({ NODE_ENV: 'development', AUTH_RATE_LIMIT_DISABLED: 'true' }));
    for (let i = 0; i < 50; i++) s.consume('k', 1, 60_000);
  });

  describe('activo', () => {
    const make = (extra: Record<string, unknown> = {}) => new AuthThrottleService(cfg({ NODE_ENV: 'development', ...extra }));

    it('bloquea al alcanzar el máximo con 429 y mensaje de reintento', () => {
      const s = make();
      s.consume('k', 3, 60_000);
      s.consume('k', 3, 60_000);
      s.consume('k', 3, 60_000);
      try {
        s.consume('k', 3, 60_000);
        fail('debía lanzar');
      } catch (e: any) {
        expect(e.getStatus()).toBe(429);
        expect(e.getResponse()).toMatchObject({ retryAfterSeconds: 60 });
      }
    });

    it('assertBelow no registra intentos; add sí', () => {
      const s = make();
      for (let i = 0; i < 10; i++) s.assertBelow('k', 2, 60_000);
      s.add('k', 60_000);
      s.add('k', 60_000);
      expect(() => s.assertBelow('k', 2, 60_000)).toThrow();
    });

    it('las claves son independientes y clear reinicia una', () => {
      const s = make();
      s.add('a', 60_000);
      s.add('a', 60_000);
      expect(() => s.assertBelow('a', 2, 60_000)).toThrow();
      expect(() => s.assertBelow('b', 2, 60_000)).not.toThrow();
      s.clear('a');
      expect(() => s.assertBelow('a', 2, 60_000)).not.toThrow();
    });

    it('la ventana es deslizante: los intentos antiguos dejan de contar', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const s = make();
      s.add('k', 60_000);
      s.add('k', 60_000);
      expect(() => s.assertBelow('k', 2, 60_000)).toThrow();
      jest.setSystemTime(new Date('2026-01-01T00:01:01Z'));
      expect(() => s.assertBelow('k', 2, 60_000)).not.toThrow();
    });

    it('los límites salen de la configuración con valores por defecto razonables', () => {
      expect(make().limits).toMatchObject({ loginFailsPerAccount: 10, loginFailsPerIp: 100, registerPerIp: 10, refreshPerIp: 60 });
      const custom = make({ AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT: 3, AUTH_LOGIN_WINDOW_MINUTES: 1 }).limits;
      expect(custom.loginFailsPerAccount).toBe(3);
      expect(custom.loginWindowMs).toBe(60_000);
      expect(make({ AUTH_REGISTER_MAX_PER_IP: 'abc' }).limits.registerPerIp).toBe(10);
    });
  });
});
