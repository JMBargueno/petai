import { ChatMessageInput, ChatOptions, LlmEvent, LlmProvider, ToolCall } from './llm-provider';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOOL_ARGS_CHARS = 10_000;
const MAX_TOOL_CALLS = 4;

/** Traduce nuestros mensajes al formato de Chat Completions de OpenAI. */
function toWire(m: ChatMessageInput) {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

/**
 * Proveedor para cualquier API compatible con OpenAI Chat Completions:
 * OpenAI, Hermes Agent (API server), OpenRouter, Ollama…
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  async *chat(messages: ChatMessageInput[], opts: ChatOptions): AsyncIterable<LlmEvent> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      // redirect: 'error' evita que un endpoint redirija a una dirección interna (SSRF)
      redirect: 'error',
      signal,
      body: JSON.stringify({
        model: opts.model,
        messages: messages.map(toWire),
        ...(opts.tools?.length
          ? {
              tools: opts.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
              tool_choice: 'auto',
            }
          : {}),
        stream: true,
        stream_options: { include_usage: true },
        temperature: opts.temperature ?? 0.8,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(await describeError(res));
    }
    if (!res.body) {
      throw new Error('El proveedor no devolvió un flujo de respuesta');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let usage: { promptTokens?: number; completionTokens?: number } | undefined;
    // Las llamadas a herramientas llegan fragmentadas por índice: se acumulan
    const calls = new Map<number, { id: string; name: string; args: string }>();
    const flushCalls = function* (): Generator<LlmEvent> {
      for (const [, c] of [...calls.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_TOOL_CALLS)) {
        if (c.name) yield { type: 'tool_call', id: c.id || `call_${Math.random().toString(36).slice(2, 10)}`, name: c.name, arguments: c.args };
      }
      calls.clear();
    };

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        // Se ignoran comentarios, líneas "event:" (p. ej. hermes.tool.progress) y vacías
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          yield* flushCalls();
          yield { type: 'done', usage };
          return;
        }
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text.length > 0) yield { type: 'delta', text };
          for (const tc of json.choices?.[0]?.delta?.tool_calls ?? []) {
            const idx = typeof tc.index === 'number' ? tc.index : 0;
            const cur = calls.get(idx) ?? { id: '', name: '', args: '' };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (typeof tc.function?.arguments === 'string' && cur.args.length < MAX_TOOL_ARGS_CHARS) {
              cur.args += tc.function.arguments;
            }
            calls.set(idx, cur);
          }
          if (json.usage) {
            usage = {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
            };
          }
        } catch {
          // fragmento no JSON: se ignora
        }
      }
    }
    yield* flushCalls();
    yield { type: 'done', usage };
  }

  async test(model: string): Promise<void> {
    let got = false;
    for await (const ev of this.chat([{ role: 'user', content: 'ping' }], { model, maxTokens: 5 })) {
      if (ev.type === 'delta') got = true;
    }
    if (!got) throw new Error('El proveedor respondió sin contenido');
  }
}

async function describeError(res: Response): Promise<string> {
  if (res.status === 401 || res.status === 403) return 'Key rechazada por el proveedor (401/403)';
  if (res.status === 404) return 'Endpoint o modelo no encontrado (404)';
  if (res.status === 429) return 'Límite de peticiones del proveedor alcanzado (429)';
  return `El proveedor respondió con error ${res.status}`;
}
