import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BillingConfigService } from './billing-config.service';
import { EntitlementService } from './entitlement.service';
import { Plan } from './plans';
import { GooglePlayClient, PlayPurchaseNotFoundError, PlaySubscriptionV2 } from './google-play.client';

/** Estado de `SubscriptionPurchaseV2.subscriptionState` → estado interno de `Subscription`. */
const PLAY_STATE_TO_STATUS: Record<string, string> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  // En periodo de gracia Google sigue concediendo el acceso
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billingConfig: BillingConfigService,
    private readonly entitlement: EntitlementService,
    private readonly realtime: RealtimeGateway,
    private readonly googlePlay: GooglePlayClient,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey && stripeKey !== 'mock-stripe-secret') {
      const StripeConstructor = typeof Stripe === 'function' ? Stripe : (Stripe as any)?.default ?? require('stripe');
      this.stripe = new StripeConstructor(stripeKey);
    }
  }

  private get publicWebUrl(): string {
    return this.config.get<string>('PUBLIC_WEB_URL') || 'http://localhost:5173';
  }

  /**
   * Garantiza que el usuario tenga un Customer ID de Stripe.
   */
  async ensureStripeCustomer(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    if (!this.stripe) {
      // Entorno de desarrollo / tests sin Stripe real
      const mockCustomerId = `cus_mock_${userId.slice(0, 8)}`;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: mockCustomerId },
      });
      return mockCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  /**
   * Genera una sesión de Stripe Checkout para suscribirse a Pro.
   */
  async createStripeCheckoutSession(userId: string): Promise<{ url: string }> {
    const customer = await this.ensureStripeCustomer(userId);

    if (!this.stripe) {
      this.logger.warn('STRIPE_SECRET_KEY no configurada; devolviendo URL de prueba de Checkout');
      return { url: `${this.publicWebUrl}/pro/ok?mock=true&user=${userId}` };
    }

    const priceId = this.config.get<string>('STRIPE_PRICE_PRO') || 'price_mock_pro';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      success_url: `${this.publicWebUrl}/pro/ok?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.publicWebUrl}/pro/cancel`,
      automatic_tax: { enabled: true },
    });

    if (!session.url) throw new BadRequestException('No se pudo generar la URL de Checkout');
    return { url: session.url };
  }

  /**
   * Genera una sesión del portal de cliente de Stripe para gestionar tarjeta o cancelar.
   */
  async createStripePortalSession(userId: string): Promise<{ url: string }> {
    const customer = await this.ensureStripeCustomer(userId);

    if (!this.stripe) {
      this.logger.warn('STRIPE_SECRET_KEY no configurada; devolviendo URL de prueba del Portal');
      return { url: `${this.publicWebUrl}/pro` };
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer,
      return_url: `${this.publicWebUrl}/pro`,
    });

    return { url: session.url };
  }

  /**
   * Idempotencia de eventos de pago con hash SHA-256 del payload.
   * Devuelve `true` si es la primera vez que se procesa; `false` si ya existía.
   */
  async claimEvent(
    source: 'stripe' | 'google_play',
    eventId: string,
    type: string,
    payload?: unknown,
    userId?: string,
  ): Promise<boolean> {
    const payloadHash = createHash('sha256')
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}))
      .digest('hex');

    try {
      await this.prisma.billingEvent.create({
        data: {
          source,
          eventId,
          type,
          userId: userId ?? null,
          payloadHash,
        },
      });
      return true;
    } catch (err: any) {
      if (err.code === 'P2002') {
        this.logger.debug(`Evento ${source}:${eventId} ya procesado previamente (idempotencia)`);
        return false;
      }
      throw err;
    }
  }

  /** Libera un evento reclamado cuyo procesamiento falló, para que el reintento del emisor se procese. */
  async releaseEvent(source: 'stripe' | 'google_play', eventId: string): Promise<void> {
    await this.prisma.billingEvent.deleteMany({ where: { source, eventId } });
  }

  /**
   * Sincroniza una suscripción de Stripe en la base de datos (fuente de verdad).
   */
  async syncStripeSubscription(subscriptionObj: any, explicitUserId?: string): Promise<void> {
    const subId = subscriptionObj.id;
    const status = subscriptionObj.status;
    const currentPeriodEnd = new Date(subscriptionObj.current_period_end * 1000);
    const cancelAtPeriodEnd = subscriptionObj.cancel_at_period_end ?? false;
    const productId = subscriptionObj.items?.data?.[0]?.price?.id || 'pockai_pro_monthly';

    let userId = explicitUserId || subscriptionObj.metadata?.userId;
    if (!userId && subscriptionObj.customer) {
      const user = await this.prisma.user.findFirst({
        where: { stripeCustomerId: subscriptionObj.customer },
        select: { id: true },
      });
      userId = user?.id;
    }

    if (!userId) {
      this.logger.warn(`No se pudo asociar la suscripción ${subId} a ningún usuario`);
      return;
    }

    await this.prisma.subscription.upsert({
      where: {
        source_externalId: { source: 'stripe', externalId: subId },
      },
      create: {
        userId,
        source: 'stripe',
        externalId: subId,
        productId,
        plan: 'pro',
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      },
      update: {
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        productId,
      },
    });

    await this.entitlement.invalidate(userId);
    const plan = await this.entitlement.planFor(userId);
    this.realtime.emitToUser(userId, 'entitlement:updated', { plan });
  }

  /**
   * Marca una suscripción en past_due aplicando el periodo de gracia configurable.
   */
  async markPastDue(subId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { source_externalId: { source: 'stripe', externalId: subId } },
    });
    if (!sub) return;

    const graceDays = this.billingConfig.subscriptionSettings().gracePeriodDays ?? 3;
    const graceUntil = new Date(Date.now() + graceDays * 86_400_000);

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'past_due', graceUntil },
    });

    await this.entitlement.invalidate(sub.userId);
    const plan = await this.entitlement.planFor(sub.userId);
    this.realtime.emitToUser(sub.userId, 'entitlement:updated', { plan });
  }

  /**
   * Revoca una suscripción tras disputa o reembolso inmediato.
   */
  async revokeSubscription(subId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { source_externalId: { source: 'stripe', externalId: subId } },
    });
    if (!sub) return;

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'revoked' },
    });

    await this.entitlement.invalidate(sub.userId);
    const plan = await this.entitlement.planFor(sub.userId);
    this.realtime.emitToUser(sub.userId, 'entitlement:updated', { plan });
  }

  /** BILLING_MOCK_ENABLED=true fuera de producción: compras de Play aceptadas sin verificar (solo dev/tests). */
  private get billingMockAllowed(): boolean {
    return this.config.get<string>('BILLING_MOCK_ENABLED') === 'true' && this.config.get<string>('NODE_ENV') !== 'production';
  }

  /**
   * Verificación y reconocimiento de compras de Google Play (Android).
   * El estado y la caducidad se leen SIEMPRE de la Play Developer API; el cliente solo aporta el token.
   */
  async verifyGooglePlayPurchase(
    userId: string,
    purchaseToken: string,
    productId: string,
  ): Promise<{ plan: Plan }> {
    if (typeof purchaseToken !== 'string' || !purchaseToken || purchaseToken.length > 4096) {
      throw new BadRequestException('purchaseToken no válido');
    }
    if (typeof productId !== 'string' || !this.googlePlay.allowedProductIds().has(productId)) {
      throw new BadRequestException('productId no válido');
    }

    // Un token de compra pertenece a un único usuario
    const existing = await this.prisma.subscription.findUnique({
      where: { source_externalId: { source: 'google_play', externalId: purchaseToken } },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException('Esta compra ya está asociada a otra cuenta');
    }

    let status: string;
    let currentPeriodEnd: Date;
    let linkedPurchaseToken: string | undefined;

    if (this.googlePlay.isConfigured) {
      let purchase: PlaySubscriptionV2;
      try {
        purchase = await this.googlePlay.getSubscription(purchaseToken);
      } catch (err) {
        if (err instanceof PlayPurchaseNotFoundError) throw new BadRequestException('Compra de Google Play no válida');
        throw err;
      }

      const item = purchase.lineItems?.find((li) => li.productId === productId);
      if (!item?.expiryTime) throw new BadRequestException('La compra no corresponde a este producto');

      const owner = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
      if (owner && owner !== userId && owner !== createHash('sha256').update(userId).digest('hex')) {
        throw new ForbiddenException('La compra pertenece a otra cuenta');
      }

      status = PLAY_STATE_TO_STATUS[purchase.subscriptionState ?? ''] ?? 'pending';
      currentPeriodEnd = new Date(item.expiryTime);
      linkedPurchaseToken = purchase.linkedPurchaseToken;

      if (status === 'active' && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
        // Sin acknowledge Google reembolsa la compra a los 3 días
        await this.googlePlay.acknowledge(productId, purchaseToken);
      }
    } else if (this.billingMockAllowed) {
      this.logger.warn('Google Play no configurado: compra aceptada SIN verificar (BILLING_MOCK_ENABLED)');
      status = 'active';
      currentPeriodEnd = new Date(Date.now() + 30 * 86_400_000);
    } else {
      throw new ServiceUnavailableException('La verificación de compras de Google Play no está disponible');
    }

    await this.prisma.subscription.upsert({
      where: { source_externalId: { source: 'google_play', externalId: purchaseToken } },
      create: {
        userId,
        source: 'google_play',
        externalId: purchaseToken,
        productId,
        plan: 'pro',
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd: status === 'canceled',
      },
      update: { status, currentPeriodEnd, productId, cancelAtPeriodEnd: status === 'canceled' },
    });

    // Una renovación/cambio de plan sustituye al token anterior: ese ya no da acceso
    if (linkedPurchaseToken) {
      await this.prisma.subscription.updateMany({
        where: { source: 'google_play', externalId: linkedPurchaseToken, userId },
        data: { status: 'expired' },
      });
    }

    await this.entitlement.invalidate(userId);
    const plan = await this.entitlement.planFor(userId);
    this.realtime.emitToUser(userId, 'entitlement:updated', { plan });

    return { plan };
  }

  /**
   * Procesa notificaciones en tiempo real de Google Play (RTDN Pub/Sub). La autenticidad del push
   * la comprueba el controlador; aun así el estado se relee de la Play Developer API (la notificación
   * solo indica "algo cambió en este token").
   */
  async handleGoogleRtdn(messageData: {
    messageId: string;
    packageName?: string;
    subscriptionNotification?: {
      notificationType: number;
      purchaseToken: string;
      subscriptionId: string;
    };
  }): Promise<void> {
    const notif = messageData.subscriptionNotification;
    if (!notif || typeof notif.purchaseToken !== 'string' || typeof messageData.messageId !== 'string') return;
    if (this.googlePlay.packageName && messageData.packageName !== this.googlePlay.packageName) {
      this.logger.warn(`RTDN de un paquete inesperado (${messageData.packageName}); se ignora`);
      return;
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { source_externalId: { source: 'google_play', externalId: notif.purchaseToken } },
    });
    if (!sub) return;

    const claimed = await this.claimEvent(
      'google_play',
      messageData.messageId,
      `rtdn_type_${notif.notificationType}`,
      messageData,
      sub.userId,
    );
    if (!claimed) return;

    try {
      let status = sub.status;
      let currentPeriodEnd = sub.currentPeriodEnd;
      let cancelAtPeriodEnd = sub.cancelAtPeriodEnd;

      if (this.googlePlay.isConfigured) {
        const purchase = await this.googlePlay.getSubscription(notif.purchaseToken).catch((err) => {
          // Token invalidado por Google (p. ej. reembolso/revocación): sin acceso
          if (err instanceof PlayPurchaseNotFoundError) return null;
          throw err;
        });
        if (!purchase) {
          status = 'revoked';
        } else {
          status = PLAY_STATE_TO_STATUS[purchase.subscriptionState ?? ''] ?? 'pending';
          const item = purchase.lineItems?.find((li) => li.productId === sub.productId) ?? purchase.lineItems?.[0];
          if (item?.expiryTime) currentPeriodEnd = new Date(item.expiryTime);
          cancelAtPeriodEnd = status === 'canceled';
        }
        // REVOKED: Google reembolsó y retiró el acceso de inmediato
        if (notif.notificationType === 12) status = 'revoked';
      } else if (this.billingMockAllowed) {
        // Solo dev/tests: mapeo por tipo de notificación
        // 2 = RENEWED, 3 = CANCELED, 12 = REVOKED, 13 = EXPIRED
        if (notif.notificationType === 2) status = 'active';
        else if (notif.notificationType === 3) cancelAtPeriodEnd = true;
        else if (notif.notificationType === 12) status = 'revoked';
        else if (notif.notificationType === 13) status = 'expired';
      } else {
        throw new ServiceUnavailableException('Google Play no configurado');
      }

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status, currentPeriodEnd, cancelAtPeriodEnd },
      });
    } catch (err) {
      // Pub/Sub reintenta si respondemos error: el evento no debe quedar marcado como procesado
      await this.releaseEvent('google_play', messageData.messageId).catch(() => undefined);
      throw err;
    }

    await this.entitlement.invalidate(sub.userId);
    const plan = await this.entitlement.planFor(sub.userId);
    this.realtime.emitToUser(sub.userId, 'entitlement:updated', { plan });
  }

  /**
   * Permite inyectar una instancia de Stripe en tests.
   */
  setStripeClientForTest(stripe: Stripe | null) {
    this.stripe = stripe;
  }
}
