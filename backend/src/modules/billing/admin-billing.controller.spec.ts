import { Test, TestingModule } from '@nestjs/testing';
import { AdminBillingController } from './admin-billing.controller';
import { BillingConfigService } from './billing-config.service';
import { ManagedBudgetService } from './managed-budget.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminBillingController', () => {
  let controller: AdminBillingController;
  let billingConfigService: Partial<BillingConfigService>;
  let managedBudgetService: Partial<ManagedBudgetService>;
  let prismaService: any;

  beforeEach(async () => {
    billingConfigService = {
      getConfig: jest.fn().mockReturnValue({ version: 2, data: { pricing: { monthlyPriceEur: 9.99 } } }),
      saveNewVersion: jest.fn().mockResolvedValue({ version: 3, data: {} }),
      listVersions: jest.fn().mockResolvedValue([{ version: 2, active: true }]),
      activateVersion: jest.fn().mockResolvedValue({}),
      pricingSettings: jest.fn().mockReturnValue({ monthlyPriceEur: 9.99 }),
    };

    managedBudgetService = {
      getDailySpendUsd: jest.fn().mockResolvedValue(1.2345),
    };

    prismaService = {
      subscription: {
        count: jest.fn().mockImplementation(({ where }) => {
          if (where?.status?.in) return Promise.resolve(10); // active
          if (where?.status === 'past_due') return Promise.resolve(2);
          if (where?.status === 'canceled') return Promise.resolve(1);
          return Promise.resolve(0);
        }),
      },
      aiUsage: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 45.67 } }),
        count: jest.fn().mockResolvedValue(15),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminBillingController],
      providers: [
        { provide: BillingConfigService, useValue: billingConfigService },
        { provide: ManagedBudgetService, useValue: managedBudgetService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    controller = module.get<AdminBillingController>(AdminBillingController);
  });

  it('devuelve la configuración activa', () => {
    const res = controller.getConfig();
    expect(res).toEqual({ version: 2, data: { pricing: { monthlyPriceEur: 9.99 } } });
  });

  it('guarda una nueva versión', async () => {
    const res = await controller.updateConfig({ id: 'admin1' }, { data: { free: {} }, note: 'Test update' });
    expect(billingConfigService.saveNewVersion).toHaveBeenCalledWith({ free: {} }, 'admin1', 'Test update');
    expect(res).toEqual({ version: 3, data: {} });
  });

  it('lista versiones', async () => {
    const res = await controller.listVersions();
    expect(res).toEqual([{ version: 2, active: true }]);
  });

  it('reactiva una versión histórica', async () => {
    const res = await controller.activateVersion({ id: 'admin1' }, 1);
    expect(billingConfigService.activateVersion).toHaveBeenCalledWith(1, 'admin1');
    expect(res.version).toBe(1);
  });

  it('calcula métricas de negocio en stats', async () => {
    const stats = await controller.stats();
    expect(stats.activeSubscribers).toBe(10);
    expect(stats.pastDueSubscribers).toBe(2);
    expect(stats.canceledSubscribers30d).toBe(1);
    expect(stats.estimatedMrr).toBe(99.9);
    expect(stats.dailySpendUsd).toBe(1.2345);
    expect(stats.monthlySpendUsd).toBe(45.67);
    expect(stats.activeFreeUsersToday).toBe(5);
  });
});
