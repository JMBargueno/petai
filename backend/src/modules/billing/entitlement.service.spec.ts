import { EntitlementService } from './entitlement.service';

describe('EntitlementService', () => {
  let prisma: any;
  let redis: any;
  let svc: EntitlementService;

  beforeEach(() => {
    prisma = {
      subscription: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    redis = {
      key: jest.fn((k: string) => `test:${k}`),
      run: jest.fn(),
    };
    svc = new EntitlementService(prisma, redis);
  });

  describe('planFor', () => {
    it('devuelve el plan en caché de Redis si existe', async () => {
      redis.run.mockImplementation(async (fn: any) => fn({ get: jest.fn(async () => 'pro') }));

      const plan = await svc.planFor('user-cached');
      expect(plan).toBe('pro');
      expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('devuelve free cuando no hay suscripciones activas', async () => {
      redis.run.mockImplementation(async (fn: any) =>
        fn({ get: jest.fn(async () => null), set: jest.fn(async () => 'OK') }),
      );
      prisma.subscription.findFirst.mockResolvedValue(null);

      const plan = await svc.planFor('user-nosub');
      expect(plan).toBe('free');
    });

    it('devuelve pro cuando hay una suscripción activa', async () => {
      redis.run.mockImplementation(async (fn: any) =>
        fn({ get: jest.fn(async () => null), set: jest.fn(async () => 'OK') }),
      );
      prisma.subscription.findFirst.mockResolvedValue({ id: 'sub-1' });

      const plan = await svc.planFor('user-pro');
      expect(plan).toBe('pro');
    });
  });

  describe('invalidate', () => {
    it('elimina la clave de caché en Redis', async () => {
      const delMock = jest.fn(async () => 1);
      redis.run.mockImplementation(async (fn: any) => fn({ del: delMock }));

      await svc.invalidate('user-pro');
      expect(delMock).toHaveBeenCalledWith('test:entitlement:user-pro');
    });
  });

  describe('getDetails', () => {
    it('detecta doble suscripción si tiene Stripe y Google Play activas a la vez', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        {
          id: 'sub-stripe',
          source: 'stripe',
          currentPeriodEnd: new Date(Date.now() + 86400000),
          cancelAtPeriodEnd: false,
          status: 'active',
          createdAt: new Date(),
        },
        {
          id: 'sub-play',
          source: 'google_play',
          currentPeriodEnd: new Date(Date.now() + 86400000),
          cancelAtPeriodEnd: false,
          status: 'active',
          createdAt: new Date(Date.now() - 1000),
        },
      ]);

      const details = await svc.getDetails('user-double');
      expect(details.plan).toBe('pro');
      expect(details.duplicateSubscriptions).toBe(true);
    });

    it('con Pro regalado y Stripe, la principal es Stripe y no cuenta como duplicada', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-v', source: 'voucher', currentPeriodEnd: new Date(Date.now() + 9e8), cancelAtPeriodEnd: false, status: 'active', createdAt: new Date() },
        { id: 'sub-s', source: 'stripe', currentPeriodEnd: new Date(Date.now() + 86400000), cancelAtPeriodEnd: true, status: 'active', createdAt: new Date(Date.now() - 1000) },
      ]);

      const details = await svc.getDetails('user-mixed');
      expect(details.source).toBe('stripe');
      expect(details.cancelAtPeriodEnd).toBe(true);
      expect(details.duplicateSubscriptions).toBe(false);
    });

    it('solo con Pro regalado devuelve source voucher', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-v', source: 'voucher', currentPeriodEnd: new Date(Date.now() + 9e8), cancelAtPeriodEnd: false, status: 'active', createdAt: new Date() },
      ]);

      const details = await svc.getDetails('user-gift');
      expect(details).toMatchObject({ plan: 'pro', source: 'voucher', duplicateSubscriptions: false });
    });
  });
});
