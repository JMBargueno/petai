import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmRequest, LlmEvent } from '../llm-provider.interface';

/**
 * OpenAI provider adapter.
 * Feature 019: Multi-Model AI Router
 *
 * Implements the LlmProvider interface for OpenAI API (chat completions + streaming).
 * Backwards-compatible with the existing LlmProvider used in AiModule.
 */
@Injectable()
export class OpenAiProvider implements LlmProvider, OnModuleInit, OnModuleDestroy {
  readonly name = 'openai';
  readonly supportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
  ];

  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';
    this.timeout = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 10000;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(`OpenAI provider initialized (base: ${this.baseUrl})`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('OpenAI provider destroyed');
  }

  async *streamChat(request: LlmRequest): AsyncIterable<LlmEvent> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
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

      if (response.status === 429) {
        yield { type: 'error', message: 'Rate limited (429)', code: 'RATE_LIMIT' };
        return;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        yield { type: 'error', message: `OpenAI error ${response.status}: ${errorBody}`, code: String(response.status) };
        return;
      }

      yield* this.parseSseStream(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (controller.signal.aborted) {
        yield { type: 'error', message: `Timeout after ${this.timeout}ms`, code: 'TIMEOUT' };
      } else {
        yield { type: 'error', message: `OpenAI connection error: ${message}`, code: 'CONNECTION' };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async *parseSseStream(response: Response): AsyncIterable<LlmEvent> {
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', message: 'No response body from OpenAI' };
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

          if (delta?.content) yield { type: 'token', content: delta.content };

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
        } catch { /* skip malformed */ }
      }
    }

    yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }

  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.000005, output: 0.000015 },
      'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
      'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
      'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
      'o1': { input: 0.000015, output: 0.00006 },
      'o1-mini': { input: 0.0000011, output: 0.0000044 },
    };
    const p = pricing[model] ?? pricing['gpt-4o-mini'];
    return promptTokens * p.input + completionTokens * p.output;
  }
}
