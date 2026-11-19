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
  // Aventura diaria: historias del bucket que puede jugar al día
  dailyStories: z.number().int().min(0).max(8).default(1),
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
  dailyStories: z.number().int().min(0).max(8).default(3),
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
      dailyStories: 1,
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
      dailyStories: 3,
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
        // Precio conservador (USD por millón de tokens) para reservar presupuesto antes de la llamada
        // y para contabilizar si OpenRouter no devuelve `usage.cost`. Debe cubrir el modelo más caro.
        estimatePromptUsdPerMTok: z.number().min(0).max(100).default(0.5),
        estimateCompletionUsdPerMTok: z.number().min(0).max(400).default(2),
      })
      .default({
        enabled: true,
        primaryModel: 'google/gemini-2.5-flash-lite',
        fallbackModels: ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
        dailyBudgetUsd: 10,
        proBudgetMultiplier: 1.5,
        maxConcurrency: 200,
        firstTokenTimeoutSeconds: 10,
        estimatePromptUsdPerMTok: 0.5,
        estimateCompletionUsdPerMTok: 2,
      }),
    // IA del sistema: tareas internas sin usuario (historias de la aventura diaria). Modelo y
    // presupuesto propios, separados de la IA gestionada del chat.
    systemAi: z
      .object({
        enabled: z.boolean().default(true),
        model: z.string().min(1).default('google/gemini-2.5-flash'),
        fallbackModels: z.array(z.string()).default(['google/gemini-2.5-flash-lite']),
        dailyBudgetUsd: z.number().min(0).max(1000).default(1),
        maxOutputTokens: z.number().int().min(256).max(8000).default(3000),
        temperature: z.number().min(0).max(2).default(0.9),
        estimatePromptUsdPerMTok: z.number().min(0).max(100).default(0.5),
        estimateCompletionUsdPerMTok: z.number().min(0).max(400).default(3),
      })
      .default({
        enabled: true,
        model: 'google/gemini-2.5-flash',
        fallbackModels: ['google/gemini-2.5-flash-lite'],
        dailyBudgetUsd: 1,
        maxOutputTokens: 3000,
        temperature: 0.9,
        estimatePromptUsdPerMTok: 0.5,
        estimateCompletionUsdPerMTok: 3,
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
  })
  .refine((data) => data.pro.dailyStories >= data.free.dailyStories, {
    message: 'Las historias diarias de Pro deben ser mayores o iguales que las de Free (invariante pro >= free)',
    path: ['pro', 'dailyStories'],
  });

export type BillingConfigData = z.infer<typeof billingConfigSchema>;

export const DEFAULT_BILLING_CONFIG: BillingConfigData = billingConfigSchema.parse({});
