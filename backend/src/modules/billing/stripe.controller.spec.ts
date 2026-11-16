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
    };
    config = {
      get: jest.fn((k: string) => {
        if (k === 'STRIPE_SECRET_KEY') return 'mock-key';
        if (k === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test';
        return undefined;
      }),
    };
    controller = new StripeController(billing, config);
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
  });
});
