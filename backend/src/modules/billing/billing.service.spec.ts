import { BillingService } from './billing.service';

describe('BillingService', () => {
  let prisma: any;
  let config: any;
  let billingConfig: any;
  let entitlement: any;
  let realtime: any;
  let googlePlay: any;
  let svc: BillingService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      billingEvent: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    config = {
      get: jest.fn((k: string) => {
        if (k === 'PUBLIC_WEB_URL') return 'http://localhost:5173';
        if (k === 'STRIPE_SECRET_KEY') return 'mock-stripe-secret';
        if (k === 'STRIPE_PRICE_PRO') return 'price_pro_monthly';
        if (k === 'NODE_ENV') return 'test';
        return undefined;
      }),
    };
    billingConfig = {
      subscriptionSettings: jest.fn(() => ({ gracePeriodDays: 3 })),
    };
    entitlement = {
      invalidate: jest.fn(),
      planFor: jest.fn(async () => 'pro'),
    };
    realtime = {
      emitToUser: jest.fn(),
    };
    googlePlay = {
      isConfigured: true,
      packageName: 'app.pockai',
      allowedProductIds: jest.fn(() => new Set(['pockai_pro_monthly'])),
      getSubscription: jest.fn(),
      acknowledge: jest.fn(),
    };
    svc = new BillingService(prisma, config, billingConfig, entitlement, realtime, googlePlay);
  });

  describe('ensureStripeCustomer', () => {
    it('devuelve el stripeCustomerId si el usuario ya lo tiene', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', stripeCustomerId: 'cus_existing' });

      const res = await svc.ensureStripeCustomer('u1');
      expect(res).toBe('cus_existing');
    });

    it('crea un id mock si no hay cliente Stripe en vivo en dev', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1-12345678', email: 'test@petai.app', stripeCustomerId: null });

      const res = await svc.ensureStripeCustomer('u1-12345678');
      expect(res).toBe('cus_mock_u1-12345');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1-12345678' },
        data: { stripeCustomerId: 'cus_mock_u1-12345' },
      });
    });
  });

  describe('claimEvent', () => {
    it('registra el evento con hash SHA-256 y devuelve true si es nuevo', async () => {
      prisma.billingEvent.create.mockResolvedValue({ id: 'e1' });

      const res = await svc.claimEvent('stripe', 'evt_123', 'checkout.session.completed', { data: 'test' });
      expect(res).toBe(true);
      expect(prisma.billingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'stripe',
            eventId: 'evt_123',
            type: 'checkout.session.completed',
            payloadHash: expect.any(String),
          }),
        }),
      );
    });

    it('devuelve false si el evento ya fue procesado previamente (P2002 error)', async () => {
      prisma.billingEvent.create.mockRejectedValue({ code: 'P2002' });

      const res = await svc.claimEvent('stripe', 'evt_duplicate', 'invoice.paid');
      expect(res).toBe(false);
    });
  });

  describe('syncStripeSubscription', () => {
    it('actualiza la suscripción, invalida caché y emite entitlement:updated por socket', async () => {
      const subObj = {
        id: 'sub_123',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
        customer: 'cus_123',
        items: { data: [{ price: { id: 'price_pro' } }] },
      };
      prisma.user.findFirst.mockResolvedValue({ id: 'user-sub-1' });

      await svc.syncStripeSubscription(subObj);

      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source_externalId: { source: 'stripe', externalId: 'sub_123' } },
          create: expect.objectContaining({ userId: 'user-sub-1', plan: 'pro', status: 'active' }),
        }),
      );
      expect(entitlement.invalidate).toHaveBeenCalledWith('user-sub-1');
      expect(realtime.emitToUser).toHaveBeenCalledWith('user-sub-1', 'entitlement:updated', { plan: 'pro' });
    });
  });

  describe('markPastDue', () => {
    it('asigna fecha de gracia y emite actualización', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ id: 'sub-db-1', userId: 'user-past' });

      await svc.markPastDue('sub_123');

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-db-1' },
          data: expect.objectContaining({
            status: 'past_due',
            graceUntil: expect.any(Date),
          }),
        }),
      );
      expect(realtime.emitToUser).toHaveBeenCalledWith('user-past', 'entitlement:updated', { plan: 'pro' });
    });
  });

  describe('verifyGooglePlayPurchase', () => {
    const expiry = new Date(Date.now() + 20 * 86_400_000).toISOString();

    it('verifica la compra contra Google, la reconoce y activa Pro con la caducidad real', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      googlePlay.getSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        lineItems: [{ productId: 'pockai_pro_monthly', expiryTime: expiry }],
      });

      const res = await svc.verifyGooglePlayPurchase('u-android', 'token_play_123', 'pockai_pro_monthly');

      expect(res.plan).toBe('pro');
      expect(googlePlay.getSubscription).toHaveBeenCalledWith('token_play_123');
      expect(googlePlay.acknowledge).toHaveBeenCalledWith('pockai_pro_monthly', 'token_play_123');
      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source_externalId: { source: 'google_play', externalId: 'token_play_123' } },
          create: expect.objectContaining({ userId: 'u-android', status: 'active', currentPeriodEnd: new Date(expiry) }),
        }),
      );
      expect(realtime.emitToUser).toHaveBeenCalledWith('u-android', 'entitlement:updated', { plan: 'pro' });
    });

    it('rechaza un token que Google no reconoce', async () => {
      const { PlayPurchaseNotFoundError } = jest.requireActual('./google-play.client');
      prisma.subscription.findUnique.mockResolvedValue(null);
      googlePlay.getSubscription.mockRejectedValue(new PlayPurchaseNotFoundError('404'));

      await expect(svc.verifyGooglePlayPurchase('u1', 'inventado', 'pockai_pro_monthly')).rejects.toThrow('no válida');
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('rechaza productos fuera de la lista permitida', async () => {
      await expect(svc.verifyGooglePlayPurchase('u1', 'tok', 'otro_producto')).rejects.toThrow('productId');
      expect(googlePlay.getSubscription).not.toHaveBeenCalled();
    });

    it('rechaza un token ya asociado a otro usuario', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ userId: 'otro' });
      await expect(svc.verifyGooglePlayPurchase('u1', 'tok', 'pockai_pro_monthly')).rejects.toThrow('otra cuenta');
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('rechaza la compra si obfuscatedExternalAccountId apunta a otra cuenta', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      googlePlay.getSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId: 'pockai_pro_monthly', expiryTime: expiry }],
        externalAccountIdentifiers: { obfuscatedExternalAccountId: 'otro' },
      });
      await expect(svc.verifyGooglePlayPurchase('u1', 'tok', 'pockai_pro_monthly')).rejects.toThrow('otra cuenta');
    });

    it('sin Google Play configurado ni modo mock responde 503 en vez de conceder Pro', async () => {
      googlePlay.isConfigured = false;
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(svc.verifyGooglePlayPurchase('u1', 'tok', 'pockai_pro_monthly')).rejects.toThrow('no está disponible');
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleGoogleRtdn', () => {
    it('relee el estado de Google en lugar de fiarse del tipo de notificación', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ id: 's1', userId: 'u1', productId: 'pockai_pro_monthly', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: new Date() });
      prisma.billingEvent.create.mockResolvedValue({});
      googlePlay.getSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
        lineItems: [{ productId: 'pockai_pro_monthly', expiryTime: '2026-01-01T00:00:00Z' }],
      });

      // Un RENEWED (2) falso no reactiva: manda lo que diga Google
      await svc.handleGoogleRtdn({ messageId: 'm1', packageName: 'app.pockai', subscriptionNotification: { notificationType: 2, purchaseToken: 'tok', subscriptionId: 'pockai_pro_monthly' } });

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'expired' }),
      });
    });

    it('ignora notificaciones de otro paquete', async () => {
      await svc.handleGoogleRtdn({ messageId: 'm1', packageName: 'com.evil', subscriptionNotification: { notificationType: 2, purchaseToken: 'tok', subscriptionId: 'x' } });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });
});
