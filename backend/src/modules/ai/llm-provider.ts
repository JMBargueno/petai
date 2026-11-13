export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LlmEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: { promptTokens?: number; completionTokens?: number } };

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Contrato común de los proveedores de LLM (OpenAI, Hermes, cualquier endpoint compatible). */
export interface LlmProvider {
  chat(messages: ChatMessageInput[], opts: ChatOptions): AsyncIterable<LlmEvent>;
  /** Comprueba conectividad y validez de la key. Lanza un Error con motivo legible si falla. */
  test(model: string): Promise<void>;
}
