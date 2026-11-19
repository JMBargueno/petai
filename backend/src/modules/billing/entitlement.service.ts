import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Plan } from './plans';

export interface EntitlementInfo {
  plan: Plan;
  /** `voucher`: Pro regalado (vouchers o regalo del admin); no hay suscripción que gestionar. */
  source?: 'stripe' | 'google_play' | 'voucher' | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  status?: string | null;
  duplicateSubscriptions?: boolean;
}

@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Resuelve el plan efectivo del usuario ('free' | 'pro').
   * Se apoya en una caché de 60 segundos en Redis.
   */
  async planFor(userId: string): Promise<Plan> {
    const cacheKey = this.redis.key(`entitlement:${userId}`);

    const cached = await this.redis.run(async (r) => {
      return r.get(cacheKey);
    }, 'entitlement_get').catch(() => null);

    if (cached === 'free' || cached === 'pro') {
      return cached;
    }

    const now = new Date();
    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
          { status: 'canceled', cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now } },
          { status: 'past_due', graceUntil: { gt: now } },
        ],
      },
      select: { id: true },
    });

    const plan: Plan = activeSub ? 'pro' : 'free';

    await this.redis.run(async (r) => {
      await r.set(cacheKey, plan, 'EX', 60);
    }, 'entitlement_set').catch(() => undefined);

    return plan;
  }

  /**
   * Invalida la caché del plan para un usuario (por ejemplo, tras un webhook o compra).
   */
  async invalidate(userId: string): Promise<void> {
    const cacheKey = this.redis.key(`entitlement:${userId}`);
    await this.redis.run(async (r) => {
      await r.del(cacheKey);
    }, 'del').catch(() => undefined);
  }

  /**
   * Obtiene la información detallada del entitlement del usuario para GET /billing/entitlement.
   */
  async getDetails(userId: string): Promise<EntitlementInfo> {
    const now = new Date();
    const subs = await this.prisma.subscription.findMany({
      where: {
        userId,
        OR: [
          { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
          { status: 'canceled', cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now } },
          { status: 'past_due', graceUntil: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (subs.length === 0) {
      return { plan: 'free' };
    }

    // Una suscripción de pago manda sobre el Pro regalado (es la que el usuario puede gestionar), y
    // el regalo no cuenta como suscripción duplicada.
    const paid = subs.filter((s) => s.source !== 'voucher');
    const primary = paid[0] ?? subs[0];
    const sources = new Set(paid.map((s) => s.source));
    const duplicateSubscriptions = sources.size > 1;

    return {
      plan: 'pro',
      source: primary.source as 'stripe' | 'google_play' | 'voucher',
      currentPeriodEnd: primary.currentPeriodEnd,
      cancelAtPeriodEnd: primary.cancelAtPeriodEnd,
      status: primary.status,
      duplicateSubscriptions,
    };
  }
}
