import { z } from 'zod';

const freePlanLimitsSchema = z.object({
  dailyMessages: z.number().int().min(0).max(1000),
  maxInputChars: z.number().int().min(50).max(1000),
  maxOutputTokens: z.number().int().min(32).max(1200),
  historyMessages: z.number().int().min(0).max(20),
  historyCharBudget: z.number().int().min(0).max(6000),
  agentTools: z.boolean(),
  memoryExtractEvery: z.number().int().min(0).max(50),
  monthlyTokenQuota: z.number().int().min(0).max(50_000_000),
  trialMessagesUnverified: z.number().int().min(0).max(50).default(3),
});

const proPlanLimitsSchema = z.object({
  dailyMessages: z.number().int().min(0).max(5000),
  maxInputChars: z.number().int().min(50).max(1000),
  maxOutputTokens: z.number().int().min(32).max(1200),
  historyMessages: z.number().int().min(0).max(20),
  historyCharBudget: z.number().int().min(0).max(6000),
  agentTools: z.boolean(),
  memoryExtractEvery: z.number().int().min(0).max(50),
  monthlyTokenQuota: z.number().int().min(0).max(50_000_000),
});

export const billingConfigSchema = z
  .object({
    pricing: z
      .object({
        monthlyPriceUsd: z.number().min(0.99).max(99.99).default(9.99),
        monthlyPriceEur: z.number().min(0.99).max(99.99).default(9.99),
        trialDays: z.number().int().min(0).max(30).default(0),
      })
      .default({
        monthlyPriceUsd: 9.99,
        monthlyPriceEur: 9.99,
        trialDays: 0,
      }),
    free: freePlanLimitsSchema.default({
      dailyMessages: 15,
      maxInputChars: 240,
      maxOutputTokens: 120,
      historyMessages: 6,
      historyCharBudget: 1500,
      agentTools: false,
      memoryExtractEvery: 12,
      monthlyTokenQuota: 300_000,
      trialMessagesUnverified: 3,
    }),
    pro: proPlanLimitsSchema.default({
      dailyMessages: 200,
      maxInputChars: 240,
      maxOutputTokens: 160,
      historyMessages: 10,
      historyCharBudget: 3000,
      agentTools: true,
      memoryExtractEvery: 6,
      monthlyTokenQuota: 3_000_000,
    }),
    byok: z
      .object({
        rateLimitPerMinute: z.number().int().min(1).max(120).default(20),
        maxInputChars: z.number().int().min(100).max(4000).default(1000),
      })
      .default({
        rateLimitPerMinute: 20,
        maxInputChars: 1000,
      }),
    managedAi: z
      .object({
        enabled: z.boolean().default(true),
        primaryModel: z.string().min(1).default('google/gemini-2.5-flash-lite'),
        fallbackModels: z.array(z.string()).default(['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat']),
        dailyBudgetUsd: z.number().min(0).max(10_000).default(10),
        proBudgetMultiplier: z.number().min(1).max(5).default(1.5),
        maxConcurrency: z.number().int().min(1).max(5000).default(200),
        firstTokenTimeoutSeconds: z.number().int().min(3).max(60).default(10),
      })
      .default({
        enabled: true,
        primaryModel: 'google/gemini-2.5-flash-lite',
        fallbackModels: ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
        dailyBudgetUsd: 10,
        proBudgetMultiplier: 1.5,
        maxConcurrency: 200,
        firstTokenTimeoutSeconds: 10,
      }),
    subscription: z
      .object({
        gracePeriodDays: z.number().int().min(0).max(14).default(3),
      })
      .default({
        gracePeriodDays: 3,
      }),
  })
  .refine((data) => data.pro.dailyMessages >= data.free.dailyMessages, {
    message: 'Los mensajes diarios de Pro deben ser mayores o iguales que los de Free (invariante pro >= free)',
    path: ['pro', 'dailyMessages'],
  });

export type BillingConfigData = z.infer<typeof billingConfigSchema>;

export const DEFAULT_BILLING_CONFIG: BillingConfigData = billingConfigSchema.parse({});
