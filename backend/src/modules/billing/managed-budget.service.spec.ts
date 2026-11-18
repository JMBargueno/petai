import { HttpStatus } from '@nestjs/common';
import { ManagedBudgetService } from './managed-budget.service';

describe('ManagedBudgetService', () => {
  let redis: any;
  let billingConfig: any;
  let svc: ManagedBudgetService;

  beforeEach(() => {
    redis = {
      key: jest.fn((k: string) => `test:${k}`),
      run: jest.fn(),
    };
    billingConfig = {
      managedAiSettings: jest.fn(() => ({
        enabled: true,
        dailyBudgetUsd: 10,
        proBudgetMultiplier: 1.5,
      })),
    };
    svc = new ManagedBudgetService(redis, billingConfig);
  });

  describe('assertOpen', () => {
    it('lanza 503 managed_ai_paused si enabled está en false', async () => {
      billingConfig.managedAiSettings.mockReturnValue({ enabled: false });

      await expect(svc.assertOpen('free')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          response: expect.objectContaining({
            code: 'managed_ai_paused',
          }),
        }),
      );
    });

    it('lanza 503 managed_ai_unavailable si el circuit breaker está abierto', async () => {
      redis.run.mockImplementation(async (fn: any) =>
        fn({ exists: jest.fn(async () => 1) }),
      );

      await expect(svc.assertOpen('free')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          response: expect.objectContaining({
            code: 'managed_ai_unavailable',
          }),
        }),
      );
    });

    it('pausa a Free cuando se alcanza el presupuesto pero permite a Pro', async () => {
      // Gasto actual: 10 $ exactos (10.000.000 micro-USD)
      redis.run.mockImplementation(async (fn: any) => {
        return fn({
          exists: jest.fn(async () => 0),
          get: jest.fn(async () => '10000000'),
        });
      });

      // Free debe ser rechazado
      await expect(svc.assertOpen('free')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          response: expect.objectContaining({
            code: 'managed_ai_paused',
          }),
        }),
      );

      // Pro debe permitirse porque tiene multiplicador 1.5x (hasta 15 $)
      await expect(svc.assertOpen('pro')).resolves.toBeUndefined();
    });
  });

  describe('add', () => {
    it('suma micro-dólares en Redis con expiración de 48h', async () => {
      const incrbyMock = jest.fn(async () => 50000);
      const expireMock = jest.fn(async () => 1);
      redis.run.mockImplementation(async (fn: any) =>
        fn({ incrby: incrbyMock, expire: expireMock }),
      );

      await svc.add(0.05); // 0.05 USD = 50.000 micro-USD

      expect(incrbyMock).toHaveBeenCalledWith(expect.any(String), 50000);
      expect(expireMock).toHaveBeenCalledWith(expect.any(String), 172800);
    });
  });

  describe('fail-closed y reserva atómica', () => {
    const redisDown = () => redis.run.mockResolvedValue(null);

    it('con Redis caído usa el gasto en memoria: no falla en abierto', async () => {
      redisDown();
      await svc.add(10); // 10 $ registrados en el respaldo local
      await expect(svc.assertOpen('free')).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.SERVICE_UNAVAILABLE }),
      );
      expect(await svc.getDailySpendUsd()).toBe(10);
    });

    it('reserve rechaza si el script atómico indica presupuesto agotado', async () => {
      redis.run.mockImplementation(async (fn: any) =>
        fn({ exists: jest.fn(async () => 0), get: jest.fn(async () => '0'), eval: jest.fn(async () => -1) }),
      );
      await expect(svc.reserve('free', 0.01)).rejects.toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'managed_ai_paused' }) }),
      );
    });

    it('reserve devuelve los micro-USD reservados y settle ajusta la diferencia', async () => {
      const incrby = jest.fn(async () => 1);
      redis.run.mockImplementation(async (fn: any) =>
        fn({ exists: jest.fn(async () => 0), get: jest.fn(async () => '0'), eval: jest.fn(async () => 5000), incrby, expire: jest.fn() }),
      );
      const reserved = await svc.reserve('free', 0.005);
      expect(reserved).toBe(5000);

      await svc.settle(reserved, 0.0002); // gastó 200 micro-USD: se devuelven 4.800
      expect(incrby).toHaveBeenCalledWith(expect.any(String), -4800);
    });

    it('con Redis caído la reserva en memoria tampoco supera el presupuesto', async () => {
      redisDown();
      await svc.add(9.999);
      await expect(svc.reserve('free', 0.001)).resolves.toBe(1000);
      await expect(svc.reserve('free', 0.001)).rejects.toThrow();
    });
  });

  describe('acquireSlot', () => {
    it('limita los streams simultáneos a maxConcurrency (respaldo en memoria)', async () => {
      billingConfig.managedAiSettings.mockReturnValue({ enabled: true, dailyBudgetUsd: 10, maxConcurrency: 2 });
      redis.run.mockResolvedValue(null);
      const a = await svc.acquireSlot();
      await svc.acquireSlot();
      await expect(svc.acquireSlot()).rejects.toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'managed_ai_busy' }) }),
      );
      await svc.releaseSlot(a);
      await expect(svc.acquireSlot()).resolves.toEqual(expect.any(String));
    });
  });

  describe('presupuesto con ámbito propio', () => {
    it('reserva en su propia clave, sin tocar la de la IA gestionada', async () => {
      const evalMock = jest.fn(async () => 300);
      redis.run.mockImplementation(async (fn: any) => fn({ eval: evalMock }));
      await expect(svc.reserveScoped('system-ai', 1, 0.0003)).resolves.toBe(300);
      const [, , key, micro, max] = evalMock.mock.calls[0] as unknown as string[];
      expect(key).toMatch(/^test:system-ai:spend:\d{4}-\d{2}-\d{2}$/);
      expect(micro).toBe('300');
      expect(max).toBe('1000000');
    });

    it('devuelve null (sin lanzar) cuando el ámbito está agotado o su tope es 0', async () => {
      redis.run.mockImplementation(async (fn: any) => fn({ eval: jest.fn(async () => -1) }));
      await expect(svc.reserveScoped('system-ai', 1, 0.01)).resolves.toBeNull();
      await expect(svc.reserveScoped('system-ai', 0, 0.01)).resolves.toBeNull();
    });

    it('sin Redis lleva la cuenta en memoria y liquida al coste real', async () => {
      redis.run.mockRejectedValue(new Error('redis caído'));
      await expect(svc.reserveScoped('system-ai', 0.001, 0.0008)).resolves.toBe(800);
      // Se gastó menos de lo reservado: queda sitio para otra llamada
      await svc.settleScoped('system-ai', 800, 0.0002);
      await expect(svc.getScopedSpendUsd('system-ai')).resolves.toBeCloseTo(0.0002);
      await expect(svc.reserveScoped('system-ai', 0.001, 0.0008)).resolves.toBe(800);
      await expect(svc.reserveScoped('system-ai', 0.001, 0.0008)).resolves.toBeNull();
      // El gasto de la IA gestionada no se ha movido
      await expect(svc.getDailySpendUsd()).resolves.toBe(0);
    });
  });
});
