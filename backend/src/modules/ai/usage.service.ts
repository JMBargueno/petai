import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { EntitlementService } from '../billing/entitlement.service';

/**
 * Contador mensual de tokens de IA por usuario (mes UTC) y control de cuota.
 *
 * Cuota 0 = sin límite. El modo BYOK (la key es del usuario) usa la variable de
 * entorno (por defecto sin límite); el modo gestionado usa el tope mensual del plan
 * del usuario (Free/Pro) configurado en el panel de facturación.
 * Se guarda en PostgreSQL; si el volumen lo exige puede moverse a Redis sin
 * cambiar esta interfaz.
 */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly billingConfig?: BillingConfigService,
    @Optional() private readonly entitlements?: EntitlementService,
  ) {}

  static monthKey(date = new Date()): string {
    return date.toISOString().slice(0, 7);
  }

  /** Tokens mensuales permitidos para el modo indicado sin conocer el plan (0 = ilimitado). */
  quotaFor(mode: string): number {
    const key = mode === 'managed' ? 'AI_MONTHLY_TOKEN_QUOTA_MANAGED' : 'AI_MONTHLY_TOKEN_QUOTA_BYOK';
    const value = Number(this.config.get(key) ?? (mode === 'managed' ? 500_000 : 0));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  /**
   * Tope mensual del usuario: en modo gestionado, el del plan (Free/Pro) configurado en el panel;
   * en BYOK, el de la variable de entorno.
   */
  async quotaForUser(userId: string, mode: string): Promise<number> {
    if (mode !== 'managed' || !this.billingConfig || !this.entitlements) return this.quotaFor(mode);
    const plan = await this.entitlements.planFor(userId);
    const value = (await this.billingConfig.limits(plan)).monthlyTokenQuota;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  async current(userId: string) {
    const month = UsageService.monthKey();
    const row = await this.prisma.aiUsage.findUnique({ where: { userId_month: { userId, month } } });
    return { month, tokens: row?.tokens ?? 0, requests: row?.requests ?? 0 };
  }

  async record(userId: string, tokens: number, costUsd = 0, provider?: string) {
    const amount = Math.max(0, Math.floor(tokens));
    const month = UsageService.monthKey();
    await this.prisma.aiUsage.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, tokens: amount, requests: 1, ...(costUsd > 0 ? { costUsd } : {}), ...(provider ? { provider } : {}) },
      update: {
        tokens: { increment: amount },
        requests: { increment: 1 },
        ...(costUsd > 0 ? { costUsd: { increment: costUsd } } : {}),
        ...(provider ? { provider } : {}),
      },
    });
  }

  async hasQuota(userId: string, mode: string): Promise<boolean> {
    const quota = await this.quotaForUser(userId, mode);
    if (quota === 0) return true;
    return (await this.current(userId)).tokens < quota;
  }

  async assertWithinQuota(userId: string, mode: string) {
    if (!(await this.hasQuota(userId, mode))) {
      throw new HttpException(
        'Has alcanzado la cuota mensual de IA. Se renueva el día 1 del próximo mes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async summary(userId: string, mode: string) {
    const usage = await this.current(userId);
    const quota = await this.quotaForUser(userId, mode);
    return {
      ...usage,
      mode,
      quota: quota || null,
      remaining: quota ? Math.max(0, quota - usage.tokens) : null,
    };
  }
}
