import { describe, it, expect } from 'vitest';
import { readCompletionStream } from './hermesLocal';

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  // Trozos pequeños para probar el reensamblado de líneas
  const chunks = lines.join('\n').match(/[\s\S]{1,7}/g) ?? [];
  return new ReadableStream({
    start(c) {
      chunks.forEach((ch) => c.enqueue(enc.encode(ch)));
      c.close();
    },
  });
}

const data = (delta: Record<string, string>) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n`;

describe('readCompletionStream (Hermes local)', () => {
  it('separa reasoning_content de la respuesta', async () => {
    const deltas: string[] = [];
    const out = await readCompletionStream(
      sse([data({ reasoning_content: 'The trainer says hola. ' }), data({ reasoning_content: 'Let me consider' }), data({ content: '¡Hola!' }), 'data: [DONE]\n']),
      (d) => deltas.push(d),
    );
    expect(out).toEqual({ reply: '¡Hola!', thinking: 'The trainer says hola. Let me consider' });
    expect(deltas.join('')).toBe('¡Hola!');
  });

  it('separa los bloques <think> del contenido y solo emite la respuesta', async () => {
    const deltas: string[] = [];
    const out = await readCompletionStream(
      sse([data({ content: '<think>razono' }), data({ content: '</think>\n\n¡Hola, ' }), data({ content: 'entrenador!' }), 'data: [DONE]\n']),
      (d) => deltas.push(d),
    );
    expect(out).toEqual({ reply: '¡Hola, entrenador!', thinking: 'razono' });
    expect(deltas.join('')).not.toContain('razono');
  });

  it('sin razonamiento devuelve thinking vacío', async () => {
    const out = await readCompletionStream(sse([data({ content: 'Hola' })]), () => {});
    expect(out).toEqual({ reply: 'Hola', thinking: '' });
  });
});
