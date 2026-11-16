import { HttpException, HttpStatus } from '@nestjs/common';
import { DailyQuotaService, nextLocalMidnight } from './daily-quota.service';

describe('DailyQuotaService', () => {
  let redis: any;
  let prisma: any;
  let billingConfig: any;
  let svc: DailyQuotaService;

  beforeEach(() => {
    redis = {
      key: jest.fn((k: string) => `test:${k}`),
      run: jest.fn(),
    };
    prisma = {
      user: {
        findUnique: jest.fn(async () => ({ timezone: 'Europe/Madrid' })),
      },
    };
    billingConfig = {
      limits: jest.fn(async (plan: string) => ({
        dailyMessages: plan === 'pro' ? 200 : 15,
      })),
    };
    svc = new DailyQuotaService(redis, prisma, billingConfig);
  });

  describe('nextLocalMidnight', () => {
    it('calcula una fecha futura en formato ISO', () => {
      const iso = nextLocalMidnight('Europe/Madrid');
      const target = new Date(iso);
      expect(target.getTime()).toBeGreaterThan(Date.now());
      // No debe ser superior a 25 horas en el futuro
      expect(target.getTime() - Date.now()).toBeLessThanOrEqual(25 * 3600 * 1000);
    });
  });

  describe('consume', () => {
    it('consume mensaje correctamente cuando hay cuota disponible en Redis', async () => {
      redis.run.mockImplementation(async (fn: any) => {
        const client = {
          eval: jest.fn(async () => 5), // Quinto mensaje consumido
        };
        return fn(client);
      });

      const res = await svc.consume('user-1', 'free');
      expect(res.used).toBe(5);
      expect(res.limit).toBe(15);
      expect(res.key).toContain('test:daily:user-1:');
    });

    it('lanza 429 con daily_quota_exceeded si se supera el límite en Redis', async () => {
      redis.run.mockImplementation(async (fn: any) => {
        const client = {
          eval: jest.fn(async () => -1), // Límite superado
        };
        return fn(client);
      });

      await expect(svc.consume('user-1', 'free')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            code: 'daily_quota_exceeded',
            plan: 'free',
            limit: 15,
          }),
        }),
      );
    });

    it('recurre al respaldo en memoria si Redis está caído y no permite sobrepasar la cuota', async () => {
      // Redis caído (run devuelve null)
      redis.run.mockResolvedValue(null);

      // Consumir 15 mensajes
      for (let i = 1; i <= 15; i++) {
        const res = await svc.consume('user-mem-1', 'free');
        expect(res.used).toBe(i);
      }

      // El mensaje 16 debe ser rechazado
      await expect(svc.consume('user-mem-1', 'free')).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          response: expect.objectContaining({
            code: 'daily_quota_exceeded',
          }),
        }),
      );
    });
  });

  describe('refund', () => {
    it('ejecuta refund en Redis si está disponible', async () => {
      const evalMock = jest.fn(async () => 4);
      redis.run.mockImplementation(async (fn: any) => fn({ eval: evalMock }));

      await svc.refund('test:daily:user-1:2026-11-16');
      expect(evalMock).toHaveBeenCalled();
    });

    it('reembolsa en memoria si Redis está caído', async () => {
      redis.run.mockResolvedValue(null);

      const res = await svc.consume('user-refund', 'free');
      expect(res.used).toBe(1);

      await svc.refund(res.key);
      const peekRes = await svc.peek('user-refund', 'free');
      expect(peekRes.used).toBe(0);
    });
  });

  describe('peek', () => {
    it('devuelve el uso actual sin incrementarlo', async () => {
      redis.run.mockImplementation(async (fn: any) => fn({ get: jest.fn(async () => '8') }));

      const res = await svc.peek('user-1', 'free');
      expect(res.used).toBe(8);
      expect(res.limit).toBe(15);
    });
  });
});
