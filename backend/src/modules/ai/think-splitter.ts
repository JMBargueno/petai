/**
 * Separa en streaming el razonamiento incrustado en el contenido con etiquetas `<think>…</think>`
 * (algunos servidores locales/Hermes con Qwen o DeepSeek lo mandan así en lugar de en
 * `reasoning_content`). Lo de dentro de las etiquetas sale como `reasoning`; el resto, como `text`.
 * Las etiquetas pueden llegar partidas entre trozos: se retiene el posible prefijo hasta confirmarlo.
 */
export type ThinkPiece = { kind: 'text' | 'reasoning'; text: string };

const OPEN = '<think>';
const CLOSE = '</think>';

export class ThinkSplitter {
  private inThink = false;
  private pending = '';

  push(chunk: string): ThinkPiece[] {
    const out: ThinkPiece[] = [];
    let buf = this.pending + chunk;
    this.pending = '';
    while (buf.length > 0) {
      const tag = this.inThink ? CLOSE : OPEN;
      const idx = buf.toLowerCase().indexOf(tag);
      if (idx >= 0) {
        this.emit(out, buf.slice(0, idx));
        buf = buf.slice(idx + tag.length);
        this.inThink = !this.inThink;
        continue;
      }
      // ¿Termina el búfer con un prefijo de la etiqueta? Se retiene para el siguiente trozo
      const keep = partialSuffix(buf.toLowerCase(), tag);
      this.emit(out, buf.slice(0, buf.length - keep));
      this.pending = buf.slice(buf.length - keep);
      break;
    }
    return out;
  }

  flush(): ThinkPiece[] {
    const out: ThinkPiece[] = [];
    this.emit(out, this.pending);
    this.pending = '';
    return out;
  }

  private emit(out: ThinkPiece[], text: string) {
    if (text) out.push({ kind: this.inThink ? 'reasoning' : 'text', text });
  }
}

function partialSuffix(buf: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, buf.length); n > 0; n--) {
    if (buf.endsWith(tag.slice(0, n))) return n;
  }
  return 0;
}
