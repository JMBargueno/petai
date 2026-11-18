// Modo Hermes local: la inferencia la hace un Hermes Agent (API compatible con OpenAI) que
// corre en el propio equipo. El backend no puede alcanzar un loopback, así que es la app de
// escritorio quien llama a 127.0.0.1; el backend sigue construyendo el prompt, moderando y
// guardando el historial (ver /pets/:id/chat/local/*).
//
// La configuración (URL, modelo y key de Hermes) se guarda solo en este equipo (localStorage del
// webview) y nunca se envía al backend. En Tauri las peticiones pasan por el plugin HTTP nativo,
// cuyo permiso está limitado a 127.0.0.1 y localhost (ver capabilities/default.json).

import { ThinkTagSplitter, type SplitChunk } from './thinkTags';

export interface LocalHermesConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface WireMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const STORAGE_KEY = 'petai_hermes_local';

export const DEFAULT_LOCAL: LocalHermesConfig = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:8642/v1',
  model: 'hermes-agent',
  apiKey: '',
};

export function loadLocalConfig(): LocalHermesConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOCAL };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled === true && isLoopbackUrl(parsed.baseUrl),
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_LOCAL.baseUrl,
      model: typeof parsed.model === 'string' ? parsed.model : DEFAULT_LOCAL.model,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return { ...DEFAULT_LOCAL };
  }
}

export function saveLocalConfig(cfg: LocalHermesConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** Solo se permiten URLs http(s) a loopback, sin credenciales: es un modo local. */
export function isLoopbackUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

async function getFetch(): Promise<typeof fetch> {
  if ('__TAURI_INTERNALS__' in window) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch as unknown as typeof fetch;
  }
  return window.fetch.bind(window);
}

/** Llama al Hermes local en streaming y devuelve el texto completo. */
export async function streamLocalCompletion(
  cfg: LocalHermesConfig,
  messages: WireMessage[],
  maxTokens: number,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<LocalCompletion> {
  if (!isLoopbackUrl(cfg.baseUrl)) {
    throw new Error('La URL de Hermes local debe apuntar a 127.0.0.1 o localhost');
  }
  const doFetch = await getFetch();
  let res: Response;
  try {
    res = await doFetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, max_tokens: maxTokens, temperature: 0.8 }),
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new Error(`No se pudo conectar con tu Hermes local (${cfg.baseUrl}). ¿Está en marcha?`);
  }
  if (!res.ok || !res.body) {
    if (res.status === 401 || res.status === 403) throw new Error('Hermes local rechazó la key (401/403)');
    throw new Error(`Hermes local respondió con error ${res.status}`);
  }

  return readCompletionStream(res.body, onDelta);
}

/** Respuesta del modelo local: el texto en personaje y, aparte, su razonamiento (si lo hay). */
export interface LocalCompletion {
  reply: string;
  thinking: string;
}

/**
 * Lee el flujo SSE de Chat Completions separando el razonamiento (reasoning_content, reasoning
 * o bloques <think>) de la respuesta. onDelta solo recibe texto de la respuesta.
 */
export async function readCompletionStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<LocalCompletion> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const splitter = new ThinkTagSplitter();
  let buffer = '';
  let reply = '';
  let thinking = '';
  const take = (part: SplitChunk) => {
    thinking += part.thinking;
    if (part.text) {
      reply += part.text;
      onDelta(part.text);
    }
  };
  const finish = (): LocalCompletion => {
    take(splitter.flush());
    return { reply, thinking: thinking.trim() };
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      // Se ignoran comentarios y eventos extra (p. ej. hermes.tool.progress)
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return finish();
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        const reasoning = delta?.reasoning_content ?? delta?.reasoning;
        if (typeof reasoning === 'string') thinking += reasoning;
        if (typeof delta?.content === 'string' && delta.content) take(splitter.push(delta.content));
      } catch {
        /* fragmento no JSON */
      }
    }
  }
  return finish();
}

/** Comprueba que el Hermes local responde con la key y el modelo indicados. */
export async function testLocalHermes(cfg: LocalHermesConfig): Promise<void> {
  const { reply, thinking } = await streamLocalCompletion(cfg, [{ role: 'user', content: 'ping' }], 5, () => {});
  // Un modelo de razonamiento puede gastar los pocos tokens de la prueba solo en pensar
  if (!reply && !thinking) throw new Error('Hermes local respondió sin contenido');
}
