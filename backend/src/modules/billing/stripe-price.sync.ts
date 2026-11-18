import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Precios de Stripe ligados a una versión de BillingConfig (`BillingConfig.stripePriceIds`). */
export interface StripePriceIds {
  /** Precio mensual de Pro: EUR como moneda base y USD en `currency_options`. */
  pro?: string;
}

export interface ProPricing {
  monthlyPriceEur: number;
  monthlyPriceUsd: number;
}

const toCents = (amount: number) => Math.round(amount * 100);

/**
 * En Stripe un precio no se edita: se crea uno nuevo y se archiva el anterior (spec-34 §11.3).
 * Los suscriptores existentes conservan su precio (grandfathering); solo las altas nuevas usan el nuevo.
 */
@Injectable()
export class StripePriceSync {
  private readonly logger = new Logger(StripePriceSync.name);
  private stripe: Stripe | null = null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key && key !== 'mock-stripe-secret') {
      const StripeConstructor = typeof Stripe === 'function' ? Stripe : (Stripe as any)?.default ?? require('stripe');
      this.stripe = new StripeConstructor(key);
    }
  }

  private get productId(): string | undefined {
    return this.config.get<string>('STRIPE_PRODUCT_PRO') || undefined;
  }

  /** ¿Se pueden crear precios por API? (hace falta la key y el producto Pro de Stripe). */
  get enabled(): boolean {
    return !!this.stripe && !!this.productId;
  }

  /** Crea el precio mensual de Pro para estos importes. Error de Stripe → 502 (no se guarda nada). */
  async createProPrice(pricing: ProPricing): Promise<string> {
    if (!this.enabled) throw new Error('Stripe no configurado para crear precios');
    try {
      const price = await this.stripe!.prices.create({
        product: this.productId!,
        currency: 'eur',
        unit_amount: toCents(pricing.monthlyPriceEur),
        currency_options: { usd: { unit_amount: toCents(pricing.monthlyPriceUsd) } },
        recurring: { interval: 'month' },
        metadata: { source: 'pockai-admin-billing' },
      });
      return price.id;
    } catch (err: any) {
      this.logger.error(`No se pudo crear el precio en Stripe: ${err?.message}`);
      throw new BadGatewayException(`Stripe rechazó el nuevo precio: ${err?.message ?? 'error desconocido'}`);
    }
  }

  /** Activa o archiva un precio (best effort: un fallo aquí no deshace la configuración). */
  async setActive(priceId: string, active: boolean): Promise<void> {
    if (!this.stripe) return;
    await this.stripe.prices.update(priceId, { active }).catch((err: any) => {
      this.logger.warn(`No se pudo ${active ? 'reactivar' : 'archivar'} el precio ${priceId}: ${err?.message}`);
    });
  }

  setStripeClientForTest(stripe: Stripe | null) {
    this.stripe = stripe;
  }
}
