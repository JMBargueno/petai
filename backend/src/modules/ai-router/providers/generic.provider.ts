import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmRequest, LlmEvent, LlmProviderConfig } from '../llm-provider.interface';

/**
 * Generic OpenAI-compatible provider adapter.
 * Feature 019: Multi-Model AI Router
 *
 * Supports any OpenAI-compatible API endpoint (Ollama, Together, Replicate, etc.)
 * via configurable baseUrl and apiKey. This is the BYOK adapter.
 */
@Injectable()
export class GenericProvider implements LlmProvider {
  readonly name = 'generic';
  readonly supportedModels: string[];

  private readonly logger = new Logger(GenericProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly models: string[];

  constructor(
    private readonly configService: ConfigService,
    @Optional() config?: LlmProviderConfig,
  ) {
    this.baseUrl = config?.baseUrl ?? this.configService.get<string>('LLM_BASE_URL') ?? 'http://localhost:11434/v1';
    this.apiKey = config?.apiKey ?? this.configService.get<string>('LLM_API_KEY') ?? '';
    this.timeout = config?.timeout ?? this.configService.get<number>('LLM_TIMEOUT_MS') ?? 30000;
    const modelsRaw = this.configService.get<string>('LLM_MODELS') ?? '';
    this.models = modelsRaw.split(',').map((m) => m.trim()).filter(Boolean);
    this.supportedModels = this.models.length > 0 ? this.models : ['local-model'];
    this.logger.log(`Generic provider initialized (base: ${this.baseUrl}, models: ${this.supportedModels.join(', ')})`);
  }

  async *streamChat(request: LlmRequest): AsyncIterable<LlmEvent> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          stream: true,
          ...(request.tools ? { tools: request.tools } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        yield { type: 'error', message: `Provider error ${response.status}: ${errorBody}`, code: String(response.status) };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: 'error', message: 'No response body' };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              yield { type: 'token', content: delta.content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.function?.name && tc.function?.arguments) {
                  yield { type: 'tool_call', toolCall: { id: tc.id, function: tc.function } };
                }
              }
            }

            if (parsed.usage) {
              yield {
                type: 'done',
                usage: {
                  promptTokens: parsed.usage.prompt_tokens ?? 0,
                  completionTokens: parsed.usage.completion_tokens ?? 0,
                  totalTokens: parsed.usage.total_tokens ?? 0,
                },
              };
              return;
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (controller.signal.aborted) {
        yield { type: 'error', message: `Timeout after ${this.timeout}ms`, code: 'TIMEOUT' };
      } else {
        yield { type: 'error', message: `Generic provider error: ${message}`, code: 'CONNECTION' };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  estimateCost(_model: string, _promptTokens: number, _completionTokens: number): number {
    // Generic/local providers assumed to have zero marginal cost
    return 0;
  }
}
