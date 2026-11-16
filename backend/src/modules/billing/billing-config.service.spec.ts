import { BillingConfigService } from './billing-config.service';
import { DEFAULT_BILLING_CONFIG } from './billing-config.schema';

describe('BillingConfigService', () => {
  let prisma: any;
  let redis: any;
  let config: any;
  let svc: BillingConfigService;

  beforeEach(() => {
    prisma = {
      billingConfig: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    redis = {
      key: jest.fn((k: string) => `test:${k}`),
      run: jest.fn(async (fn: any) => fn({ publish: jest.fn() })),
    };
    config = {
      get: jest.fn(),
    };
    svc = new BillingConfigService(prisma, redis, config);
  });

  afterEach(() => {
    svc.onModuleDestroy();
  });

  describe('loadActiveConfig', () => {
    it('inicializa seed v1 si la tabla está vacía', async () => {
      prisma.billingConfig.findFirst.mockResolvedValue(null);
      prisma.billingConfig.count.mockResolvedValue(0);

      await svc.loadActiveConfig();

      expect(prisma.billingConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 1,
            active: true,
          }),
        }),
      );
    });

    it('carga la configuración activa si ya existe en base de datos', async () => {
      const customConfig = JSON.parse(JSON.stringify(DEFAULT_BILLING_CONFIG));
      customConfig.free.dailyMessages = 10;
      prisma.billingConfig.findFirst.mockResolvedValue({
        version: 3,
        active: true,
        data: customConfig,
      });

      await svc.loadActiveConfig();

      const limits = await svc.limits('free');
      expect(limits.dailyMessages).toBe(10);
      expect(svc.getConfig().version).toBe(3);
    });
  });

  describe('saveNewVersion', () => {
    it('guarda nueva versión inmutable e incrementa el contador de versión', async () => {
      prisma.billingConfig.findFirst.mockResolvedValue({ version: 2 });
      const newConfig = JSON.parse(JSON.stringify(DEFAULT_BILLING_CONFIG));
      newConfig.pro.dailyMessages = 300;

      const res = await svc.saveNewVersion(newConfig, 'admin-1', 'Aumento de cuota Pro');

      expect(res.version).toBe(3);
      expect(prisma.billingConfig.updateMany).toHaveBeenCalledWith({
        where: { active: true },
        data: { active: false },
      });
      expect(prisma.billingConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 3,
            active: true,
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rechaza configuración si viola la invariante pro >= free', async () => {
      const invalidConfig = JSON.parse(JSON.stringify(DEFAULT_BILLING_CONFIG));
      invalidConfig.free.dailyMessages = 100;
      invalidConfig.pro.dailyMessages = 50; // Invalido: pro < free

      await expect(svc.saveNewVersion(invalidConfig, 'admin-1')).rejects.toThrow();
    });
  });
});
