import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmEvent } from './llm-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';
import { GenericProvider } from './providers/generic.provider';

/**
 * Fallback cascading service with circuit breaker pattern.
 * Feature 019: Multi-Model AI Router
 *
 * Tracks provider health via circuit breaker:
 * - 3 consecutive failures → open (60s cooldown)
 * - After 60s → half-open (test with next request)
 * - Success in half-open → closed
 */
@Injectable()
export class FallbackService implements OnModuleInit {
  private readonly logger = new Logger(FallbackService.name);
  private readonly providers: Map<string, LlmProvider> = new Map();

  // Circuit breaker state per provider
  private readonly breakerState = new Map<string, {
    failures: number;
    state: 'closed' | 'open' | 'half-open';
    openedAt: number;
  }>();

  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly OPEN_DURATION_MS = 60000;

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiProvider,
    private readonly genericProvider: GenericProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerProvider(this.openAiProvider);
    this.registerProvider(this.genericProvider);
    this.logger.log(`FallbackService initialized with ${this.providers.size} providers`);
  }

  registerProvider(provider: LlmProvider): void {
    this.providers.set(provider.name, provider);
    this.breakerState.set(provider.name, { failures: 0, state: 'closed', openedAt: 0 });
  }

  /**
   * Get the next available provider for the given name, respecting circuit breaker state.
   * Returns null if all providers are in 'open' state.
   */
  getAvailableProvider(preferredName?: string): LlmProvider | null {
    const order = this.getCircuitBreakerOrder(preferredName);

    for (const name of order) {
      const provider = this.providers.get(name);
      if (!provider) continue;

      const state = this.breakerState.get(name)!;
      if (state.state === 'open') {
        // Check if cooldown has passed → half-open
        if (Date.now() - state.openedAt > FallbackService.OPEN_DURATION_MS) {
          state.state = 'half-open';
          this.logger.debug(`Circuit half-open for provider: ${name}`);
        } else {
          continue;
        }
      }

      return provider;
    }

    return null;
  }

  /**
   * Get ordered provider list considering circuit breaker (healthy first).
   */
  private getCircuitBreakerOrder(preferred?: string): string[] {
    const names = Array.from(this.providers.keys());
    if (!preferred || !names.includes(preferred)) return names;

    // Preferred provider first, then the rest
    return [preferred, ...names.filter((n) => n !== preferred)];
  }

  recordSuccess(providerName: string): void {
    const state = this.breakerState.get(providerName);
    if (state) {
      state.failures = 0;
      state.state = 'closed';
    }
  }

  recordFailure(providerName: string): void {
    const state = this.breakerState.get(providerName);
    if (!state) return;

    state.failures++;

    if (state.state === 'half-open') {
      // Failed in half-open → back to open
      state.state = 'open';
      state.openedAt = Date.now();
      this.logger.warn(`Circuit back to OPEN for ${providerName}`);
    } else if (state.failures >= FallbackService.FAILURE_THRESHOLD) {
      state.state = 'open';
      state.openedAt = Date.now();
      this.logger.warn(`Circuit OPEN for ${providerName} (${state.failures} failures)`);
    }
  }

  /**
   * Get health status of all providers (for admin endpoints).
   */
  getProviderStatus(): Array<{
    name: string;
    state: string;
    failures: number;
    models: string[];
  }> {
    return Array.from(this.providers.entries()).map(([name, provider]) => {
      const state = this.breakerState.get(name)!;
      return {
        name,
        state: state.state,
        failures: state.failures,
        models: provider.supportedModels,
      };
    });
  }

  /**
   * Execute a request through the router with automatic fallback.
   * Yields events from the first successful provider.
   */
  async *executeWithFallback(
    preferredProvider: string | undefined,
    execute: (provider: LlmProvider) => AsyncIterable<LlmEvent>,
  ): AsyncIterable<LlmEvent> {
    // Re-iterate providers in priority order
    const order = this.getCircuitBreakerOrder(preferredProvider);

    for (const name of order) {
      const provider = this.providers.get(name);
      if (!provider) continue;

      const state = this.breakerState.get(name)!;
      if (state.state === 'open') {
        if (Date.now() - state.openedAt < FallbackService.OPEN_DURATION_MS) continue;
        state.state = 'half-open';
      }

      let hasError = false;
      try {
        for await (const event of execute(provider)) {
          if (event.type === 'error') hasError = true;
          yield event;
        }

        if (!hasError) {
          this.recordSuccess(name);
          return;
        }
      } catch {
        hasError = true;
      }

      if (hasError) {
        this.recordFailure(name);
        this.logger.debug(`Fallback: ${name} failed, trying next`);
      }
    }

    yield { type: 'error', message: 'No provider available', code: 'NO_PROVIDER' };
  }
}
