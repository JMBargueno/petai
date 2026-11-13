import { ChatMessageInput, ChatOptions, LlmEvent, LlmProvider } from './llm-provider';

const REQUEST_TIMEOUT_MS = 60_000;

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
        messages,
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
          yield { type: 'done', usage };
          return;
        }
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text.length > 0) yield { type: 'delta', text };
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
