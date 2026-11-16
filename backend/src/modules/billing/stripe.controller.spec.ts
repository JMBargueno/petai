import { StripeController } from './stripe.controller';

describe('StripeController', () => {
  let billing: any;
  let config: any;
  let controller: StripeController;

  beforeEach(() => {
    billing = {
      createStripeCheckoutSession: jest.fn(async () => ({ url: 'https://checkout.stripe.com/pay/cs_123' })),
      createStripePortalSession: jest.fn(async () => ({ url: 'https://billing.stripe.com/session/bps_123' })),
      claimEvent: jest.fn(async () => true),
      syncStripeSubscription: jest.fn(async () => undefined),
      markPastDue: jest.fn(async () => undefined),
      revokeSubscription: jest.fn(async () => undefined),
      releaseEvent: jest.fn(async () => undefined),
    };
    config = {
      get: jest.fn((k: string) => {
        if (k === 'BILLING_MOCK_ENABLED') return 'true';
        if (k === 'NODE_ENV') return 'test';
        return undefined;
      }),
    };
    controller = new StripeController(billing, config);
    controller.setStripeClientForTest(null);
  });

  describe('checkout', () => {
    it('delega en billing.createStripeCheckoutSession', async () => {
      const res = await controller.checkout({ id: 'user-1' });
      expect(res.url).toBe('https://checkout.stripe.com/pay/cs_123');
      expect(billing.createStripeCheckoutSession).toHaveBeenCalledWith('user-1');
    });
  });

  describe('portal', () => {
    it('delega en billing.createStripePortalSession', async () => {
      const res = await controller.portal({ id: 'user-1' });
      expect(res.url).toBe('https://billing.stripe.com/session/bps_123');
      expect(billing.createStripePortalSession).toHaveBeenCalledWith('user-1');
    });
  });

  describe('webhook', () => {
    it('procesa checkout.session.completed', async () => {
      const mockReq = {
        body: {
          id: 'evt_checkout_done',
          type: 'checkout.session.completed',
          data: {
            object: {
              subscription: 'sub_xyz',
              client_reference_id: 'user-ref-1',
            },
          },
        },
      };

      const res = await controller.webhook(mockReq as any);
      expect(res.ok).toBe(true);
      expect(billing.claimEvent).toHaveBeenCalledWith('stripe', 'evt_checkout_done', 'checkout.session.completed', expect.any(Object));
      expect(billing.syncStripeSubscription).toHaveBeenCalled();
    });

    it('devuelve duplicate: true si el evento ya fue procesado antes (idempotencia)', async () => {
      billing.claimEvent.mockResolvedValue(false);
      const mockReq = {
        body: {
          id: 'evt_already_seen',
          type: 'invoice.paid',
          data: { object: {} },
        },
      };

      const res = await controller.webhook(mockReq as any);
      expect(res.ok).toBe(true);
      expect(res.duplicate).toBe(true);
      expect(billing.syncStripeSubscription).not.toHaveBeenCalled();
    });
    describe('con Stripe configurado', () => {
      let stripe: any;
      beforeEach(() => {
        config.get.mockImplementation((k: string) => (k === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined));
        stripe = {
          webhooks: { constructEvent: jest.fn() },
          subscriptions: { retrieve: jest.fn() },
        };
        controller.setStripeClientForTest(stripe);
      });

      it('rechaza un webhook sin cabecera stripe-signature (no cae al modo mock)', async () => {
        const req = { body: { id: 'evt_forged', type: 'checkout.session.completed', data: { object: {} } }, rawBody: Buffer.from('{}') };
        await expect(controller.webhook(req as any)).rejects.toThrow('Falta la firma');
        expect(billing.claimEvent).not.toHaveBeenCalled();
        expect(billing.syncStripeSubscription).not.toHaveBeenCalled();
      });

      it('rechaza un webhook con firma inválida', async () => {
        stripe.webhooks.constructEvent.mockImplementation(() => {
          throw new Error('bad sig');
        });
        const req = { body: {}, rawBody: Buffer.from('{}') };
        await expect(controller.webhook(req as any, 't=1,v1=x')).rejects.toThrow('no válida');
        expect(billing.syncStripeSubscription).not.toHaveBeenCalled();
      });

      it('no inventa la suscripción si Stripe no la devuelve y libera el evento para el reintento', async () => {
        stripe.webhooks.constructEvent.mockReturnValue({
          id: 'evt_1',
          type: 'checkout.session.completed',
          data: { object: { subscription: 'sub_fake', client_reference_id: 'u1' } },
        });
        stripe.subscriptions.retrieve.mockRejectedValue(new Error('No such subscription'));
        await expect(controller.webhook({ rawBody: Buffer.from('{}') } as any, 'sig')).rejects.toThrow('No such subscription');
        expect(billing.syncStripeSubscription).not.toHaveBeenCalled();
        expect(billing.releaseEvent).toHaveBeenCalledWith('stripe', 'evt_1');
      });
    });

    it('sin Stripe configurado y sin BILLING_MOCK_ENABLED rechaza el webhook', async () => {
      config.get.mockImplementation(() => undefined);
      const req = { body: { id: 'evt_x', type: 'checkout.session.completed', data: { object: {} } } };
      await expect(controller.webhook(req as any)).rejects.toThrow('no configurados');
    });

    it('BILLING_MOCK_ENABLED no tiene efecto en producción', async () => {
      config.get.mockImplementation((k: string) => (k === 'BILLING_MOCK_ENABLED' ? 'true' : k === 'NODE_ENV' ? 'production' : undefined));
      const req = { body: { id: 'evt_x', type: 'checkout.session.completed', data: { object: {} } } };
      await expect(controller.webhook(req as any)).rejects.toThrow('no configurados');
    });
  });
});
