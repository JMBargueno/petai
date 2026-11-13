export interface ToolCall {
  id: string;
  name: string;
  /** JSON en texto tal y como lo devolvió el modelo (sin validar). */
  arguments: string;
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Solo en mensajes del asistente que solicitan herramientas. */
  toolCalls?: ToolCall[];
  /** Solo en mensajes role=tool: identifica la llamada a la que responden. */
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema de los parámetros. */
  parameters: Record<string, unknown>;
}

export type LlmEvent =
  | { type: 'delta'; text: string }
  | ({ type: 'tool_call' } & ToolCall)
  | { type: 'done'; usage?: { promptTokens?: number; completionTokens?: number } };

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

/** Contrato común de los proveedores de LLM (OpenAI, Hermes, cualquier endpoint compatible). */
export interface LlmProvider {
  chat(messages: ChatMessageInput[], opts: ChatOptions): AsyncIterable<LlmEvent>;
  /** Comprueba conectividad y validez de la key. Lanza un Error con motivo legible si falla. */
  test(model: string): Promise<void>;
}
