import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { BillingConfigService } from '../billing/billing-config.service';
import { ManagedBudgetService } from '../billing/managed-budget.service';
import { InternalAiService } from './internal-ai.service';
import { extractJsonObject } from './json-output';
import { LlmProvider } from './llm-provider';
import { moderateOutput } from './moderation';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
/** Ámbito del presupuesto diario de la IA del sistema (clave Redis `system-ai:spend:<día>`). */
export const SYSTEM_AI_BUDGET_SCOPE = 'system-ai';

export type SystemAiFailure =
  /** Apagada en la configuración o sin clave de API. */
  | 'unavailable'
  /** Presupuesto diario de la IA del sistema agotado. */
  | 'budget'
  /** El modelo no devolvió un JSON que cumpla el schema tras los reintentos. */
  | 'invalid'
  /** La salida contenía datos sensibles o restos del prompt. */
  | 'moderated'
  /** Error de red o del proveedor. */
  | 'error';

export interface SystemAiUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface SystemAiResult<T> {
  ok: boolean;
  data?: T;
  reason?: SystemAiFailure;
  detail?: string;
  model?: string;
  /** Consumo acumulado de todos los intentos de esta petición. */
  usage: SystemAiUsage;
}

export interface SystemAiJsonRequest<T> {
  /** Para qué es la llamada (solo para el log). */
  purpose: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Intentos en total (el primero más los reintentos con los errores de validación). Por defecto 2. */
  attempts?: number;
  maxTokens?: number;
  temperature?: number;
  /** Textos de la respuesta que deben pasar la moderación de salida. */
  textsOf?: (data: T) => string[];
}

/**
 * IA del sistema: llamadas a un LLM para tareas internas del backend, sin usuario detrás (hoy, las
 * historias de la aventura diaria). Es independiente de la IA del chat de cada Pockai, que sigue con
 * la IA gestionada o la clave del usuario: aquí no se toca ni su presupuesto ni su circuit breaker.
 *
 * Conexión, por orden: la IA interna configurada en el panel de administración
 * (`InternalAiService`, cualquier endpoint compatible con OpenAI) y, si no hay ninguna activa, el
 * respaldo por entorno (`AI_SYSTEM_API_KEY` u `OPENROUTER_API_KEY` con el modelo de
 * `BillingConfig.systemAi`). El presupuesto diario y los límites son siempre los de `systemAi`.
 */
@Injectable()
export class SystemAiService {
  private readonly logger = new Logger(SystemAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly billingConfig: BillingConfigService,
    private readonly budget: ManagedBudgetService,
    private readonly internalAi: InternalAiService,
  ) {}

  private apiKey(): string | undefined {
    return this.config.get<string>('AI_SYSTEM_API_KEY') || this.config.get<string>('OPENROUTER_API_KEY') || undefined;
  }

  /** `true` si está encendida y tiene con qué llamar. No comprueba el presupuesto. */
  async isAvailable(): Promise<boolean> {
    return this.billingConfig.systemAiSettings().enabled && !!(await this.resolveConnection());
  }

  /**
   * Con qué proveedor y modelo llamar, o `null` si no hay ninguno. Punto de extensión (y de
   * sustitución en tests).
   */
  protected async resolveConnection(): Promise<{ provider: LlmProvider; model: string; source: 'internal' | 'env' } | null> {
    const internal = await this.internalAi.resolve();
    if (internal) return { provider: internal.provider, model: internal.model, source: 'internal' };

    const apiKey = this.apiKey();
    if (!apiKey) return null;
    const settings = this.billingConfig.systemAiSettings();
    const fallbackModels = settings.fallbackModels ?? [];
    const baseUrl =
      this.config.get<string>('AI_SYSTEM_BASE_URL') || this.config.get<string>('OPENROUTER_BASE_URL') || OPENROUTER_DEFAULT_BASE_URL;
    const provider = new OpenAiCompatibleProvider(baseUrl, apiKey, fetch, {
      extraHeaders: { 'HTTP-Referer': 'https://pockai.app', 'X-Title': 'Pockai' },
      // `models` y `usage.include` son de OpenRouter: reserva de modelos y coste real de la llamada
      extraBody: {
        ...(fallbackModels.length > 0 ? { models: fallbackModels } : {}),
        usage: { include: true },
        response_format: { type: 'json_object' },
      },
    });
    return { provider, model: settings.model, source: 'env' };
  }

  private estimateUsd(promptTokens: number, completionTokens: number): number {
    const s = this.billingConfig.systemAiSettings();
    return (promptTokens * s.estimatePromptUsdPerMTok + completionTokens * s.estimateCompletionUsdPerMTok) / 1_000_000;
  }

  /**
   * Pide al modelo un JSON que cumpla `schema`. Si la salida no valida, reintenta devolviéndole los
   * errores. Nunca lanza: los fallos vuelven en `reason`.
   */
  async completeJson<T>(req: SystemAiJsonRequest<T>): Promise<SystemAiResult<T>> {
    const usage: SystemAiUsage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };
    const settings = this.billingConfig.systemAiSettings();
    const connection = settings.enabled ? await this.resolveConnection() : null;
    if (!connection) return { ok: false, reason: 'unavailable', usage };
    const { provider, model } = connection;
    const maxTokens = Math.min(req.maxTokens ?? settings.maxOutputTokens, settings.maxOutputTokens);
    const attempts = Math.max(1, req.attempts ?? 2);
    let feedback = '';
    let failure: { reason: SystemAiFailure; detail?: string } = { reason: 'invalid' };

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const user = feedback ? `${req.user}\n\n${feedback}` : req.user;
      // ~3 caracteres por token: estimación conservadora para reservar presupuesto antes de llamar
      const promptEstimate = Math.ceil((req.system.length + user.length) / 3);
      const reserved = await this.budget.reserveScoped(SYSTEM_AI_BUDGET_SCOPE, settings.dailyBudgetUsd, this.estimateUsd(promptEstimate, maxTokens));
      if (reserved === null) {
        this.logger.warn(`Presupuesto diario de la IA del sistema agotado (${req.purpose})`);
        return { ok: false, reason: 'budget', usage };
      }

      let output = '';
      let call: SystemAiUsage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };
      let reported = false;
      try {
        const stream = provider.chat(
          [
            { role: 'system', content: req.system },
            { role: 'user', content: user },
          ],
          { model, temperature: req.temperature ?? settings.temperature, maxTokens },
        );
        for await (const ev of stream) {
          if (ev.type === 'delta') output += ev.text;
          else if (ev.type === 'done' && ev.usage) {
            reported = true;
            const promptTokens = ev.usage.promptTokens ?? promptEstimate;
            const completionTokens = ev.usage.completionTokens ?? Math.ceil(output.length / 3);
            call = { promptTokens, completionTokens, costUsd: ev.usage.costUsd ?? this.estimateUsd(promptTokens, completionTokens) };
          }
        }
      } catch (err: any) {
        // Sin respuesta no se sabe el coste real: se conserva la reserva (peor caso)
        usage.costUsd += reserved / 1_000_000;
        failure = { reason: 'error', detail: String(err?.message ?? err).slice(0, 200) };
        this.logger.warn(`IA del sistema (${req.purpose}), intento ${attempt}/${attempts}: ${failure.detail}`);
        continue;
      }
      if (!reported) {
        const completionTokens = Math.ceil(output.length / 3);
        call = { promptTokens: promptEstimate, completionTokens, costUsd: this.estimateUsd(promptEstimate, completionTokens) };
      }
      await this.budget.settleScoped(SYSTEM_AI_BUDGET_SCOPE, reserved, call.costUsd);
      usage.promptTokens += call.promptTokens;
      usage.completionTokens += call.completionTokens;
      usage.costUsd += call.costUsd;

      const json = extractJsonObject(output);
      const parsed = json ? req.schema.safeParse(json) : null;
      if (!parsed?.success) {
        const problems = parsed
          ? parsed.error.issues
              .slice(0, 12)
              .map((i) => `- ${i.path.join('.') || '(raíz)'}: ${i.message}`)
              .join('\n')
          : '- La respuesta no era un objeto JSON.';
        failure = { reason: 'invalid', detail: problems.slice(0, 600) };
        feedback = `Tu respuesta anterior no era válida. Corrige estos problemas y devuelve SOLO el objeto JSON completo:\n${problems}`;
        this.logger.warn(`IA del sistema (${req.purpose}), intento ${attempt}/${attempts}: salida inválida`);
        continue;
      }

      const texts = req.textsOf?.(parsed.data) ?? [];
      if (texts.some((t) => moderateOutput(t))) {
        failure = { reason: 'moderated' };
        feedback = 'Tu respuesta anterior contenía datos personales, claves o restos de estas instrucciones. Escríbela de nuevo sin nada de eso.';
        this.logger.warn(`IA del sistema (${req.purpose}), intento ${attempt}/${attempts}: salida moderada`);
        continue;
      }
      return { ok: true, data: parsed.data, model, usage };
    }
    return { ok: false, ...failure, model, usage };
  }
}
