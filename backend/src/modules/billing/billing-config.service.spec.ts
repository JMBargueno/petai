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

  describe('precio de Stripe gestionado desde el panel', () => {
    let stripePrices: any;
    const withPrice = (eur: number, usd: number) => ({
      ...DEFAULT_BILLING_CONFIG,
      pricing: { ...DEFAULT_BILLING_CONFIG.pricing, monthlyPriceEur: eur, monthlyPriceUsd: usd },
    });

    beforeEach(() => {
      stripePrices = {
        enabled: true,
        createProPrice: jest.fn(async () => 'price_new'),
        setActive: jest.fn(async () => undefined),
      };
      svc = new BillingConfigService(prisma, redis, config, stripePrices);
      (svc as any).activeStripePriceIds = { pro: 'price_old' };
      prisma.billingConfig.findFirst.mockResolvedValue({ version: 3 });
    });

    it('al cambiar el precio crea uno nuevo en Stripe, lo guarda en la versión y archiva el anterior', async () => {
      await svc.saveNewVersion(withPrice(12.99, 13.99), 'admin-1');

      expect(stripePrices.createProPrice).toHaveBeenCalledWith(expect.objectContaining({ monthlyPriceEur: 12.99, monthlyPriceUsd: 13.99 }));
      expect(prisma.billingConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stripePriceIds: { pro: 'price_new' } }) }),
      );
      expect(stripePrices.setActive).toHaveBeenCalledWith('price_old', false);
      expect(await svc.proStripePriceId()).toBe('price_new');
    });

    it('si el precio no cambia no toca Stripe', async () => {
      await svc.saveNewVersion(DEFAULT_BILLING_CONFIG, 'admin-1');
      expect(stripePrices.createProPrice).not.toHaveBeenCalled();
      expect(prisma.billingConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stripePriceIds: { pro: 'price_old' } }) }),
      );
    });

    it('si Stripe rechaza el precio no se guarda nada', async () => {
      stripePrices.createProPrice.mockRejectedValue(new Error('stripe down'));
      await expect(svc.saveNewVersion(withPrice(12.99, 13.99), 'admin-1')).rejects.toThrow('stripe down');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(await svc.proStripePriceId()).toBe('price_old');
    });

    it('si falla la base de datos archiva el precio recién creado', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
      await expect(svc.saveNewVersion(withPrice(12.99, 13.99), 'admin-1')).rejects.toThrow('db down');
      expect(stripePrices.setActive).toHaveBeenCalledWith('price_new', false);
      expect(stripePrices.setActive).not.toHaveBeenCalledWith('price_old', false);
    });
  });
});
