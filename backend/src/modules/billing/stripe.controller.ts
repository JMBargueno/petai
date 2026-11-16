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
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    let event: Stripe.Event;

    if (this.stripe && webhookSecret && sig && req.rawBody) {
      try {
        event = this.stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } catch (err: any) {
        this.logger.warn(`Fallo de verificación de firma de webhook de Stripe: ${err.message}`);
        throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
      }
    } else {
      // Entorno de test o desarrollo sin claves en vivo
      event = (req.body as Stripe.Event) ?? ({ id: 'evt_test', type: 'customer.subscription.created' } as any);
    }

    const claimed = await this.billing.claimEvent('stripe', event.id, event.type, event.data?.object);
    if (!claimed) {
      return { ok: true, duplicate: true };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.subscription) {
            // Si el cliente de Stripe está activo, podemos consultar la suscripción real
            let subObj: any = { id: session.subscription, status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 };
            if (this.stripe && typeof session.subscription === 'string') {
              try {
                subObj = await this.stripe.subscriptions.retrieve(session.subscription);
              } catch (e: any) {
                this.logger.warn(`No se pudo consultar sub ${session.subscription} en Stripe: ${e.message}`);
              }
            }
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
          const charge = event.data.object as Stripe.Charge;
          const invoiceId = (charge as any).invoice;
          if (invoiceId && this.stripe) {
            try {
              const invoice = await this.stripe.invoices.retrieve(invoiceId as string);
              const subId = (invoice as any).subscription;
              if (typeof subId === 'string') {
                await this.billing.revokeSubscription(subId);
              }
            } catch (e: any) {
              this.logger.warn(`Fallo al revocar suscripción de charge: ${e.message}`);
            }
          }
          break;
        }
      }
    } catch (err: any) {
      this.logger.error(`Error procesando evento de Stripe ${event.type}: ${err.message}`);
      throw err;
    }

    return { ok: true };
  }

  setStripeClientForTest(stripe: Stripe | null) {
    this.stripe = stripe;
  }
}
