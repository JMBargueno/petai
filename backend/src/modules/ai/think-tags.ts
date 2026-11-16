const OPEN_TAGS = ['<think>', '<thinking>'];
const CLOSE_TAGS = ['</think>', '</thinking>'];
const OPEN_RE = /<think(?:ing)?>/i;
const CLOSE_RE = /<\/think(?:ing)?>/i;

/** Índice desde el que el final de `buf` podría ser el comienzo de una etiqueta (o -1). */
function partialTagStart(buf: string, tags: string[]): number {
  const lower = buf.toLowerCase();
  const maxLen = Math.max(...tags.map((t) => t.length));
  for (let i = Math.max(0, buf.length - maxLen + 1); i < buf.length; i++) {
    const tail = lower.slice(i);
    if (tags.some((t) => t.length > tail.length && t.startsWith(tail))) return i;
  }
  return -1;
}

export interface SplitChunk {
  text: string;
  thinking: string;
}

/**
 * Separa en streaming los bloques `<think>…</think>` que algunos modelos de razonamiento
 * (Qwen, DeepSeek R1 vía Ollama/OpenRouter, Hermes…) mezclan con el contenido de la respuesta.
 * Soporta etiquetas partidas entre fragmentos y descarta los espacios iniciales de la respuesta
 * que suelen seguir al cierre del bloque.
 */
export class ThinkTagSplitter {
  private buf = '';
  private inThink = false;
  private started = false;

  push(chunk: string): SplitChunk {
    this.buf += chunk;
    const out: SplitChunk = { text: '', thinking: '' };
    for (;;) {
      const re = this.inThink ? CLOSE_RE : OPEN_RE;
      const m = re.exec(this.buf);
      if (m) {
        this.emit(out, this.buf.slice(0, m.index));
        this.buf = this.buf.slice(m.index + m[0].length);
        this.inThink = !this.inThink;
        continue;
      }
      const hold = partialTagStart(this.buf, this.inThink ? CLOSE_TAGS : OPEN_TAGS);
      const upTo = hold >= 0 ? hold : this.buf.length;
      this.emit(out, this.buf.slice(0, upTo));
      this.buf = this.buf.slice(upTo);
      return out;
    }
  }

  /** Al terminar el flujo: devuelve lo retenido (un bloque sin cerrar cuenta como razonamiento). */
  flush(): SplitChunk {
    const out: SplitChunk = { text: '', thinking: '' };
    this.emit(out, this.buf);
    this.buf = '';
    return out;
  }

  private emit(out: SplitChunk, s: string) {
    if (!s) return;
    if (this.inThink) {
      out.thinking += s;
      return;
    }
    if (!this.started) {
      s = s.replace(/^\s+/, '');
      if (!s) return;
      this.started = true;
    }
    out.text += s;
  }
}
