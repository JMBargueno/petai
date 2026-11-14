/**
 * LLM Provider interface — contract that all model adapters must implement.
 * Feature 019: Multi-Model AI Router
 */

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LlmTool[];
  [key: string]: unknown;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type LlmEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; toolCall: LlmToolCall }
  | { type: 'done'; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { type: 'error'; message: string; code?: string };

export interface LlmProvider {
  readonly name: string;
  readonly supportedModels: string[];

  /** Stream a chat completion request, yielding LlmEvent objects. */
  streamChat(request: LlmRequest): AsyncIterable<LlmEvent>;

  /** Check provider health (ping). Returns true if operational. */
  ping(): Promise<boolean>;

  /** Estimate cost for a request (USD). */
  estimateCost(model: string, promptTokens: number, completionTokens: number): number;
}

export interface LlmProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export const PROVIDER_NAMES = ['openai', 'anthropic', 'gemini', 'ollama', 'generic'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];
