export type Plan = 'free' | 'pro';

export interface PlanLimits {
  dailyMessages: number;
  maxInputChars: number;
  maxOutputTokens: number;
  historyMessages: number;
  historyCharBudget: number;
  agentTools: boolean;
  memoryExtractEvery: number;
  monthlyTokenQuota: number;
  /** Aventura diaria: historias del bucket que puede jugar al día. */
  dailyStories: number;
}

/**
 * Valores iniciales por defecto (seed de BillingConfig).
 * En ejecución se leen dinámicamente desde BillingConfigService.
 */
export const DEFAULT_PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    dailyMessages: 15,
    maxInputChars: 240,
    maxOutputTokens: 120,
    historyMessages: 6,
    historyCharBudget: 1500,
    agentTools: false,
    memoryExtractEvery: 12,
    monthlyTokenQuota: 300000,
    dailyStories: 1,
  },
  pro: {
    dailyMessages: 200,
    maxInputChars: 240,
    maxOutputTokens: 160,
    historyMessages: 10,
    historyCharBudget: 3000,
    agentTools: true,
    memoryExtractEvery: 6,
    monthlyTokenQuota: 3000000,
    dailyStories: 3,
  },
};
