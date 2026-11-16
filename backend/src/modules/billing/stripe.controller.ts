import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import Stripe from 'stripe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillingService } from './billing.service';

@ApiTags('Billing Stripe')
@Controller('billing/stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key && key !== 'mock-stripe-secret') {
      const StripeConstructor = typeof Stripe === 'function' ? Stripe : (Stripe as any)?.default ?? require('stripe');
      this.stripe = new StripeConstructor(key);
    }
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generar URL de Stripe Checkout para suscripción Pro' })
  async checkout(@CurrentUser() user: any) {
    return this.billing.createStripeCheckoutSession(user.id);
  }

  @Post('portal')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generar URL del Stripe Customer Portal para gestionar la suscripción' })
  async portal(@CurrentUser() user: any) {
    return this.billing.createStripePortalSession(user.id);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recepción de webhooks de eventos de suscripción y pago de Stripe' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig?: string,
  ) {
    const event = this.verifiedEvent(req, sig);

    const claimed = await this.billing.claimEvent('stripe', event.id, event.type, event.data?.object);
    if (!claimed) {
      return { ok: true, duplicate: true };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.subscription) {
            const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
            // La suscripción se lee siempre de Stripe (fuente de verdad); nunca se inventa su estado.
            // Si la consulta falla, el error se propaga y Stripe reintenta el webhook.
            const subObj = this.stripe
              ? await this.stripe.subscriptions.retrieve(subId)
              : { id: subId, status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 };
            await this.billing.syncStripeSubscription(subObj, session.client_reference_id || undefined);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await this.billing.syncStripeSubscription(sub);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const subId = (invoice as any).subscription;
          if (typeof subId === 'string') {
            await this.billing.markPastDue(subId);
          }
          break;
        }
        case 'charge.refunded':
        case 'charge.dispute.created': {
          if (!this.stripe) break;
          // En una disputa el objeto es un Dispute: el cargo va en `charge`
          let charge: any = event.data.object;
          if (event.type === 'charge.dispute.created') {
            const chargeRef = (event.data.object as Stripe.Dispute).charge;
            charge = typeof chargeRef === 'string' ? await this.stripe.charges.retrieve(chargeRef) : chargeRef;
          }
          const invoiceId = charge?.invoice;
          if (invoiceId) {
            // Sin try/catch: si falla, el evento se libera y Stripe lo reintenta (no se pierde la revocación)
            const invoice = await this.stripe.invoices.retrieve(typeof invoiceId === 'string' ? invoiceId : invoiceId.id);
            const subId = (invoice as any).subscription;
            if (typeof subId === 'string') {
              await this.billing.revokeSubscription(subId);
            }
          }
          break;
        }
      }
    } catch (err: any) {
      this.logger.error(`Error procesando evento de Stripe ${event.type}: ${err.message}`);
      // Se libera la reclamación para que el reintento de Stripe no se descarte como duplicado
      await this.billing.releaseEvent('stripe', event.id).catch(() => undefined);
      throw err;
    }

    return { ok: true };
  }

  /**
   * Devuelve el evento solo si su firma es válida. Sin Stripe configurado únicamente se aceptan
   * eventos sin firmar con BILLING_MOCK_ENABLED=true (desarrollo/tests; prohibido en producción).
   */
  private verifiedEvent(req: RawBodyRequest<Request>, sig?: string): Stripe.Event {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (this.stripe && webhookSecret) {
      if (!sig || !req.rawBody) {
        throw new BadRequestException('Falta la firma del webhook de Stripe');
      }
      try {
        return this.stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } catch (err: any) {
        this.logger.warn(`Fallo de verificación de firma de webhook de Stripe: ${err.message}`);
        throw new BadRequestException('Firma del webhook de Stripe no válida');
      }
    }

    const mockAllowed =
      this.config.get<string>('BILLING_MOCK_ENABLED') === 'true' && this.config.get<string>('NODE_ENV') !== 'production';
    if (!mockAllowed) {
      this.logger.error('Webhook de Stripe recibido sin STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET configurados');
      throw new ServiceUnavailableException('Webhooks de Stripe no configurados');
    }
    const body = req.body as Stripe.Event | undefined;
    if (!body?.id || !body?.type) throw new BadRequestException('Evento de Stripe mal formado');
    return body;
  }

  setStripeClientForTest(stripe: Stripe | null) {
    this.stripe = stripe;
  }
}
