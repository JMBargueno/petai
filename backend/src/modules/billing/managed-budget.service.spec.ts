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
});
