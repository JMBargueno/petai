import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { StripePriceIds, StripePriceSync } from './stripe-price.sync';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Plan, PlanLimits } from './plans';
import {
  BillingConfigData,
  billingConfigSchema,
  DEFAULT_BILLING_CONFIG,
} from './billing-config.schema';

export const REDIS_CHANNEL_BILLING_CONFIG_CHANGED = 'petai:billing:config:changed';

@Injectable()
export class BillingConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingConfigService.name);
  private activeConfig: BillingConfigData = DEFAULT_BILLING_CONFIG;
  private activeVersion = 1;
  private activeStripePriceIds: StripePriceIds = {};
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Optional() private readonly stripePrices?: StripePriceSync,
  ) {}

  async onModuleInit() {
    await this.loadActiveConfig();
    this.startBackgroundSync();
  }

  onModuleDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Carga la configuración activa de base de datos.
   * Si no existe ninguna, crea la versión 1 inicial usando los valores por defecto / seed.
   */
  async loadActiveConfig(): Promise<void> {
    try {
      const activeRow = await this.prisma.billingConfig.findFirst({
        where: { active: true },
        orderBy: { version: 'desc' },
      });

      if (activeRow) {
        const parsed = billingConfigSchema.safeParse(activeRow.data);
        if (parsed.success) {
          this.activeConfig = parsed.data;
          this.activeVersion = activeRow.version;
          this.activeStripePriceIds = ((activeRow as any).stripePriceIds as StripePriceIds | null) ?? {};
          return;
        }
        this.logger.error(`Error parseando BillingConfig versión ${activeRow.version}: ${parsed.error.message}`);
      }

      // Si no hay configuración activa, verificamos si existe alguna fila
      const count = await this.prisma.billingConfig.count();
      if (count === 0) {
        // Inicializar seed con versión 1
        const initialConfig = this.buildInitialSeed();
        await this.prisma.billingConfig.create({
          data: {
            version: 1,
            active: true,
            data: initialConfig as any,
            createdById: 'system',
            note: 'Seed inicial de configuración de facturación e IA',
          },
        });
        this.activeConfig = initialConfig;
        this.activeVersion = 1;
        this.logger.log('Inicializado BillingConfig v1 por defecto');
      }
    } catch (err: any) {
      this.logger.warn(`Error inicializando BillingConfig (${err.message}); se usan valores en memoria`);
    }
  }

  private buildInitialSeed(): BillingConfigData {
    const seed = JSON.parse(JSON.stringify(DEFAULT_BILLING_CONFIG));
    const primaryModel = this.config.get<string>('AI_MANAGED_MODEL');
    if (primaryModel) seed.managedAi.primaryModel = primaryModel;
    const budget = this.config.get<number>('AI_MANAGED_DAILY_BUDGET_USD');
    if (budget !== undefined) seed.managedAi.dailyBudgetUsd = Number(budget);
    const concurrency = this.config.get<number>('AI_MANAGED_MAX_CONCURRENCY');
    if (concurrency !== undefined) seed.managedAi.maxConcurrency = Number(concurrency);
    const freeDaily = this.config.get<number>('AI_PLAN_FREE_DAILY');
    if (freeDaily !== undefined) seed.free.dailyMessages = Number(freeDaily);
    const proDaily = this.config.get<number>('AI_PLAN_PRO_DAILY');
    if (proDaily !== undefined) seed.pro.dailyMessages = Number(proDaily);
    return billingConfigSchema.parse(seed);
  }

  private startBackgroundSync() {
    // Sincronización periódica de respaldo cada 30 segundos
    this.refreshInterval = setInterval(() => {
      this.loadActiveConfig().catch((err) => {
        this.logger.warn(`Fallo en refresco periódico de BillingConfig: ${err.message}`);
      });
    }, 30_000);
  }

  /** Devuelve los límites de ejecución para el plan especificado */
  async limits(plan: Plan): Promise<PlanLimits> {
    const p = this.activeConfig[plan];
    return {
      dailyMessages: p.dailyMessages,
      maxInputChars: p.maxInputChars,
      maxOutputTokens: p.maxOutputTokens,
      historyMessages: p.historyMessages,
      historyCharBudget: p.historyCharBudget,
      agentTools: p.agentTools,
      memoryExtractEvery: p.memoryExtractEvery,
      monthlyTokenQuota: p.monthlyTokenQuota,
    };
  }

  getConfig(): { version: number; data: BillingConfigData } {
    return {
      version: this.activeVersion,
      data: this.activeConfig,
    };
  }

  managedAiSettings() {
    return this.activeConfig.managedAi;
  }

  pricingSettings() {
    return this.activeConfig.pricing;
  }

  byokSettings() {
    return this.activeConfig.byok;
  }

  subscriptionSettings() {
    return this.activeConfig.subscription;
  }

  /**
   * Price ID de Stripe que cobra el precio de Pro de la versión activa. Si la versión aún no tiene
   * (primer arranque con Stripe), se crea a partir del precio del panel y se guarda en esa versión.
   */
  async proStripePriceId(): Promise<string | undefined> {
    if (this.activeStripePriceIds.pro) return this.activeStripePriceIds.pro;
    if (!this.stripePrices?.enabled) return undefined;
    const pro = await this.stripePrices.createProPrice(this.activeConfig.pricing);
    this.activeStripePriceIds = { ...this.activeStripePriceIds, pro };
    await this.prisma.billingConfig
      .update({ where: { version: this.activeVersion }, data: { stripePriceIds: this.activeStripePriceIds as any } })
      .catch((err: any) => this.logger.warn(`No se pudo guardar el precio de Stripe en la versión activa: ${err?.message}`));
    return pro;
  }

  /**
   * Guarda una nueva versión inmutable de configuración y la activa.
   * Publica en Redis pub/sub para que otras instancias se actualicen en <= 5 s.
   */
  async saveNewVersion(
    rawData: unknown,
    userId: string,
    note?: string,
  ): Promise<{ version: number; data: BillingConfigData }> {
    const validated = billingConfigSchema.parse(rawData);

    const latest = await this.prisma.billingConfig.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // Precio de Pro: si cambia, se crea uno nuevo en Stripe ANTES de guardar (todo o nada, §11.3)
    const previousPriceIds = this.activeStripePriceIds;
    const priceChanged =
      validated.pricing.monthlyPriceEur !== this.activeConfig.pricing.monthlyPriceEur ||
      validated.pricing.monthlyPriceUsd !== this.activeConfig.pricing.monthlyPriceUsd;
    let stripePriceIds: StripePriceIds = previousPriceIds;
    let createdPriceId: string | undefined;
    if (this.stripePrices?.enabled && (priceChanged || !previousPriceIds.pro)) {
      createdPriceId = await this.stripePrices.createProPrice(validated.pricing);
      stripePriceIds = { ...previousPriceIds, pro: createdPriceId };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingConfig.updateMany({
          where: { active: true },
          data: { active: false },
        });

        await tx.billingConfig.create({
          data: {
            version: nextVersion,
            active: true,
            data: validated as any,
            stripePriceIds: stripePriceIds as any,
            createdById: userId,
            note: note ?? null,
          },
        });

        // Registrar en AuditLog
        await tx.auditLog.create({
          data: {
            userId,
            event: priceChanged ? 'billing.price.update' : 'billing.config.update',
            metadata: {
              previousVersion: this.activeVersion,
              newVersion: nextVersion,
              note,
              ...(createdPriceId ? { previousStripePrice: previousPriceIds.pro ?? null, newStripePrice: createdPriceId } : {}),
            },
          },
        });
      });
    } catch (err) {
      // No se guardó: el precio recién creado no debe quedar vendible
      if (createdPriceId) await this.stripePrices!.setActive(createdPriceId, false);
      throw err;
    }

    if (createdPriceId && previousPriceIds.pro && previousPriceIds.pro !== createdPriceId) {
      await this.stripePrices!.setActive(previousPriceIds.pro, false);
    }

    this.activeConfig = validated;
    this.activeVersion = nextVersion;
    this.activeStripePriceIds = stripePriceIds;

    // Notificar a otras instancias vía Redis pub/sub
    await this.redis.run(async (r) => {
      await r.publish(this.redis.key(REDIS_CHANNEL_BILLING_CONFIG_CHANGED), String(nextVersion));
    }, 'publish').catch(() => undefined);

    return { version: nextVersion, data: validated };
  }

  async listVersions(limit = 20) {
    return this.prisma.billingConfig.findMany({
      orderBy: { version: 'desc' },
      take: Math.min(Math.max(1, limit), 100),
      select: {
        id: true,
        version: true,
        active: true,
        createdById: true,
        note: true,
        createdAt: true,
      },
    });
  }

  /**
   * Revierte la configuración activa a una versión previa existente.
   */
  async activateVersion(version: number, userId: string): Promise<BillingConfigData> {
    const target = await this.prisma.billingConfig.findUniqueOrThrow({
      where: { version },
    });

    const parsed = billingConfigSchema.parse(target.data);

    // El precio de Stripe vuelve con la versión: se reactiva el suyo (o se crea si no tenía) y se archiva el actual
    const previousPriceIds = this.activeStripePriceIds;
    let stripePriceIds: StripePriceIds = ((target as any).stripePriceIds as StripePriceIds | null) ?? {};
    let createdPriceId: string | undefined;
    if (this.stripePrices?.enabled) {
      if (stripePriceIds.pro) {
        await this.stripePrices.setActive(stripePriceIds.pro, true);
      } else {
        createdPriceId = await this.stripePrices.createProPrice(parsed.pricing);
        stripePriceIds = { ...stripePriceIds, pro: createdPriceId };
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.billingConfig.updateMany({
        where: { active: true },
        data: { active: false },
      });

      await tx.billingConfig.update({
        where: { version },
        data: { active: true, ...(createdPriceId ? { stripePriceIds: stripePriceIds as any } : {}) },
      });

      await tx.auditLog.create({
        data: {
          userId,
          event: 'billing.config.revert',
          metadata: {
            previousVersion: this.activeVersion,
            revertedToVersion: version,
          },
        },
      });
    });

    if (previousPriceIds.pro && previousPriceIds.pro !== stripePriceIds.pro) {
      await this.stripePrices?.setActive(previousPriceIds.pro, false);
    }

    this.activeConfig = parsed;
    this.activeVersion = version;
    this.activeStripePriceIds = stripePriceIds;

    await this.redis.run(async (r) => {
      await r.publish(this.redis.key(REDIS_CHANNEL_BILLING_CONFIG_CHANGED), String(version));
    }, 'publish').catch(() => undefined);

    return parsed;
  }
}
