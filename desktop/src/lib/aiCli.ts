// Modos «Claude CLI» y «Antigravity CLI»: la respuesta la genera un CLI de IA instalado en este
// equipo (`claude -p` o `agy -p`) con la sesión que el usuario ya tiene iniciada. Usa el mismo
// flujo que Hermes local: el backend construye el prompt (/chat/local/context), el escritorio
// genera la respuesta y el backend la modera y la guarda (/chat/local/sync).
//
// El proceso lo lanza el comando nativo `run_ai_cli` (src-tauri/src/ai_cli.rs). La configuración
// se guarda solo en este equipo y nunca se envía al backend.

import { ThinkTagSplitter, type SplitChunk } from './thinkTags';
import type { LocalCompletion, WireMessage } from './hermesLocal';

export type CliEngine = 'claude' | 'antigravity';

export interface CliConfig {
  /** Motor activo; null si ningún modo CLI está en uso. */
  engine: CliEngine | null;
  /** Modelo opcional (vacío = el predeterminado del CLI). */
  model: string;
  /** Ruta opcional al ejecutable si no está en el PATH. */
  binPath: string;
}

export const CLI_LABELS: Record<CliEngine, string> = {
  claude: 'Claude CLI',
  antigravity: 'Antigravity CLI',
};

/** Comando con el que el usuario inicia sesión en cada CLI (para los textos de ayuda). */
export const CLI_COMMANDS: Record<CliEngine, string> = {
  claude: 'claude',
  antigravity: 'agy',
};

const STORAGE_KEY = 'petai_ai_cli';
/** Historial máximo que se incluye en el prompt (caracteres). */
export const MAX_HISTORY_CHARS = 6000;

export const DEFAULT_CLI: CliConfig = { engine: null, model: '', binPath: '' };

function isEngine(v: unknown): v is CliEngine {
  return v === 'claude' || v === 'antigravity';
}

export function loadCliConfig(): CliConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CLI };
    const parsed = JSON.parse(raw);
    return {
      engine: isEngine(parsed.engine) ? parsed.engine : null,
      model: typeof parsed.model === 'string' ? parsed.model : '',
      binPath: typeof parsed.binPath === 'string' ? parsed.binPath : '',
    };
  } catch {
    return { ...DEFAULT_CLI };
  }
}

export function saveCliConfig(cfg: CliConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * Convierte la conversación que prepara el backend en lo que acepta un CLI: el system prompt aparte
 * y el resto como una transcripción que termina pidiendo solo la siguiente respuesta del Pockai.
 */
export function buildCliPrompt(messages: WireMessage[]): { system: string; prompt: string } {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  const last = turns[turns.length - 1];
  const history = last?.role === 'user' ? turns.slice(0, -1) : turns;
  // Antigravity recibe el prompt como argumento (límite de la línea de comandos en Windows):
  // se conserva el historial más reciente que quepa en MAX_HISTORY_CHARS
  const kept: string[] = [];
  let size = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    const line = `${m.role === 'user' ? 'Dueño' : 'Tú'}: ${m.content.trim()}`;
    if (size + line.length > MAX_HISTORY_CHARS) break;
    kept.unshift(line);
    size += line.length + 1;
  }
  const lines: string[] = [];
  if (kept.length) {
    lines.push('Conversación hasta ahora:', ...kept, '');
  }
  if (last?.role === 'user') lines.push(`Nuevo mensaje de tu dueño: ${last.content.trim()}`, '');
  lines.push(
    'Responde solo con lo que dirías tú, en personaje, siguiendo las instrucciones anteriores. ' +
      'No uses herramientas, no leas archivos y no añadas prefijos como «Tú:».',
  );
  return { system, prompt: lines.join('\n') };
}

export interface ClaudeStreamPiece {
  delta?: string;
  thinking?: string;
  /** Texto completo de la respuesta (evento `result`). */
  final?: string;
  error?: string;
}

/** Interpreta una línea de `claude -p --output-format stream-json --include-partial-messages`. */
export function parseClaudeStreamLine(line: string): ClaudeStreamPiece {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return {};
  let ev: any;
  try {
    ev = JSON.parse(trimmed);
  } catch {
    return {};
  }
  if (ev?.type === 'stream_event' && ev.event?.type === 'content_block_delta') {
    const d = ev.event.delta;
    if (d?.type === 'text_delta' && typeof d.text === 'string') return { delta: d.text };
    if (d?.type === 'thinking_delta' && typeof d.thinking === 'string') return { thinking: d.thinking };
    return {};
  }
  if (ev?.type === 'result') {
    const text = typeof ev.result === 'string' ? ev.result : '';
    if (ev.is_error || (ev.subtype && ev.subtype !== 'success')) {
      return { error: text || `Claude CLI terminó con error (${ev.subtype ?? 'desconocido'})` };
    }
    return { final: text };
  }
  return {};
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

/** Quita secuencias de color/cursor que algunos CLI escriben aunque no haya terminal. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/**
 * Procesa la salida de un CLI fragmento a fragmento. onDelta solo recibe texto de la respuesta
 * (sin razonamiento); `finish()` devuelve el resultado final.
 */
export class CliOutputReader {
  private splitter = new ThinkTagSplitter();
  private buffer = '';
  private reply = '';
  private thinking = '';
  private final: string | null = null;
  private error: string | null = null;

  constructor(
    private engine: CliEngine,
    private onDelta: (text: string) => void,
  ) {}

  private take(part: SplitChunk) {
    this.thinking += part.thinking;
    if (part.text) {
      this.reply += part.text;
      this.onDelta(part.text);
    }
  }

  push(chunk: string) {
    if (this.engine === 'antigravity') {
      this.take(this.splitter.push(stripAnsi(chunk)));
      return;
    }
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      this.line(this.buffer.slice(0, nl));
      this.buffer = this.buffer.slice(nl + 1);
    }
  }

  private line(line: string) {
    const p = parseClaudeStreamLine(line);
    if (p.delta) this.take(this.splitter.push(p.delta));
    if (p.thinking) this.thinking += p.thinking;
    if (p.final !== undefined) this.final = p.final;
    if (p.error) this.error = p.error;
  }

  finish(): LocalCompletion {
    if (this.buffer.trim()) this.line(this.buffer);
    this.buffer = '';
    this.take(this.splitter.flush());
    if (this.error) throw new Error(this.error);
    // Si el CLI no emitió deltas (versión antigua sin mensajes parciales) se usa el resultado final
    if (!this.reply.trim() && this.final) {
      const s = new ThinkTagSplitter();
      const a = s.push(this.final);
      const b = s.flush();
      this.thinking += a.thinking + b.thinking;
      this.reply = a.text + b.text;
      if (this.reply) this.onDelta(this.reply);
    }
    return { reply: this.reply.trim(), thinking: this.thinking.trim() };
  }
}

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let nextRequestId = 1;

/** Genera la respuesta con el CLI elegido. Misma forma que streamLocalCompletion (Hermes local). */
export async function streamCliCompletion(
  cfg: CliConfig,
  messages: WireMessage[],
  _maxTokens: number,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<LocalCompletion> {
  if (!cfg.engine) throw new Error('Elige Claude CLI o Antigravity CLI');
  if (!inTauri()) throw new Error('Los modos CLI solo funcionan en la app de escritorio');
  if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');

  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const { system, prompt } = buildCliPrompt(messages);
  const reader = new CliOutputReader(cfg.engine, onDelta);
  const requestId = nextRequestId++;
  const channel = new Channel<{ type: 'chunk'; text: string }>();
  // Los mensajes del canal pueden llegar después de que el comando termine: se cuenta lo recibido
  // y al acabar se completa con la salida íntegra que devuelve el comando (y se ignora lo tardío)
  let received = '';
  let closed = false;
  channel.onmessage = (ev) => {
    if (closed || ev.type !== 'chunk') return;
    received += ev.text;
    reader.push(ev.text);
  };
  const onAbort = () => void invoke('cancel_ai_cli', { requestId }).catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const full = await invoke<string>('run_ai_cli', {
      requestId,
      engine: cfg.engine,
      system,
      prompt,
      model: cfg.model.trim() || null,
      binPath: cfg.binPath.trim() || null,
      timeoutSecs: null,
      onEvent: channel,
    });
    closed = true;
    if (full.length > received.length && full.startsWith(received)) reader.push(full.slice(received.length));
  } catch (e: any) {
    closed = true;
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    throw new Error(typeof e === 'string' ? e : e?.message || `${CLI_LABELS[cfg.engine]} falló`);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  const result = reader.finish();
  if (!result.reply) {
    throw new Error(`${CLI_LABELS[cfg.engine]} no devolvió respuesta. ¿Has iniciado sesión con «${CLI_COMMANDS[cfg.engine]}» en la terminal?`);
  }
  return result;
}

/** Comprueba que el CLI está instalado y devuelve su versión. */
export async function testCli(cfg: CliConfig): Promise<string> {
  if (!cfg.engine) throw new Error('Elige Claude CLI o Antigravity CLI');
  if (!inTauri()) throw new Error('Los modos CLI solo funcionan en la app de escritorio');
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<string>('detect_ai_cli', { engine: cfg.engine, binPath: cfg.binPath.trim() || null });
  } catch (e: any) {
    throw new Error(typeof e === 'string' ? e : e?.message || 'No se pudo comprobar el CLI');
  }
}
