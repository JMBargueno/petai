import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { LlmRequest, LlmEvent, LlmProvider } from './llm-provider.interface';
import { FallbackService } from './fallback.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Model Router Service — core routing logic.
 * Feature 019: Multi-Model AI Router
 *
 * Selects the appropriate provider/model based on interaction_type,
 * applies token budget, and orchestrates fallback on failure.
 */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  private readonly defaultRouting: Record<string, {
    provider: string;
    model: string;
    fallbacks: string[];
    maxTokens: number;
    maxCostUsd: number;
  }> = {
    chat: { provider: 'openai', model: 'gpt-4o-mini', fallbacks: ['generic'], maxTokens: 2048, maxCostUsd: 0.02 },
    tool_use: { provider: 'openai', model: 'gpt-4o', fallbacks: ['generic'], maxTokens: 4096, maxCostUsd: 0.05 },
    creative: { provider: 'openai', model: 'gpt-4o', fallbacks: ['generic'], maxTokens: 4096, maxCostUsd: 0.1 },
    naming: { provider: 'openai', model: 'gpt-4o-mini', fallbacks: ['generic'], maxTokens: 512, maxCostUsd: 0.01 },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly fallbackService: FallbackService,
    private readonly prisma: PrismaService,
  ) {}

  async *route(
    interactionType: string,
    request: LlmRequest,
    userId?: string,
  ): AsyncIterable<LlmEvent> {
    const routing = await this.getRouting(interactionType, userId);
    this.logger.debug(`Routing: type=${interactionType}, provider=${routing.provider}`);

    const finalRequest: LlmRequest = {
      ...request,
      model: request.model || routing.model,
      maxTokens: request.maxTokens ?? routing.maxTokens,
    };

    yield* this.fallbackService.executeWithFallback(
      routing.provider,
      (provider) => this.executeWithBudget(provider, finalRequest, routing),
    );
  }

  private async *executeWithBudget(
    provider: LlmProvider,
    request: LlmRequest,
    routing: { maxCostUsd: number },
  ): AsyncIterable<LlmEvent> {
    for await (const event of provider.streamChat(request)) {
      if (event.type === 'done' && event.usage) {
        const cost = provider.estimateCost(request.model, event.usage.promptTokens, event.usage.completionTokens);
        if (cost > routing.maxCostUsd) {
          yield event;
          yield { type: 'error', message: `Token budget exceeded ($${cost.toFixed(4)} > $${routing.maxCostUsd})`, code: 'BUDGET_EXCEEDED' };
          return;
        }
      }
      yield event;
    }
  }

  async getRouting(
    interactionType: string,
    userId?: string,
  ): Promise<{ provider: string; model: string; fallbacks: string[]; maxTokens: number; maxCostUsd: number }> {
    if (userId) {
      try {
        const config = await this.prisma.aiConfig.findUnique({ where: { userId } });
        if (config?.routingOverrides) {
          const overrides = config.routingOverrides as Record<string, Record<string, unknown>>;
          const ov = overrides[interactionType];
          if (ov) {
            const base = this.defaultRouting[interactionType] ?? this.defaultRouting['chat'];
            return {
              provider: (ov.provider as string) ?? base.provider,
              model: (ov.model as string) ?? base.model,
              fallbacks: base.fallbacks,
              maxTokens: (ov.maxTokens as number) ?? base.maxTokens,
              maxCostUsd: (ov.maxCostUsd as number) ?? base.maxCostUsd,
            };
          }
        }
      } catch { /* fall through */ }
    }
    return this.defaultRouting[interactionType] ?? this.defaultRouting['chat'];
  }

  getModels() {
    return this.fallbackService.getProviderStatus();
  }

  async getBudget(userId: string) {
    const month = new Date().toISOString().slice(0, 7);
    const usage = await this.prisma.aiUsage.findUnique({
      where: { userId_month: { userId, month } },
    });
    return {
      month,
      tokens: usage?.tokens ?? 0,
      requests: usage?.requests ?? 0,
      costUsd: usage?.costUsd ?? 0,
      cacheHits: usage?.cacheHits ?? 0,
      limits: {
        maxTokens: this.configService.get<number>('AI_MAX_TOKENS_MONTH') ?? 1000000,
        maxCostUsd: this.configService.get<number>('AI_MAX_COST_MONTH') ?? 50,
      },
    };
  }

  async updateConfig(
    userId: string,
    config: {
      provider?: string;
      routingOverrides?: Record<string, Record<string, unknown>>;
      fallbackProviders?: string[];
    },
  ) {
    const fallbackJson = config.fallbackProviders as unknown as Prisma.JsonArray | undefined;
    const routingJson = config.routingOverrides as unknown as Prisma.JsonObject | undefined;

    return this.prisma.aiConfig.upsert({
      where: { userId },
      update: {
        ...(config.provider ? { provider: config.provider } : {}),
        ...(routingJson ? { routingOverrides: routingJson } : {}),
        ...(fallbackJson ? { fallbackProviders: fallbackJson } : {}),
      },
      create: {
        userId,
        provider: config.provider ?? 'auto',
        ...(routingJson ? { routingOverrides: routingJson } : {}),
        ...(fallbackJson ? { fallbackProviders: fallbackJson } : {}),
      },
    });
  }
}

