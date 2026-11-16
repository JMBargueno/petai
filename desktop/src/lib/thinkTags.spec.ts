import { describe, it, expect } from 'vitest';
import { ThinkTagSplitter } from './thinkTags';

function run(chunks: string[]) {
  const s = new ThinkTagSplitter();
  let text = '';
  let thinking = '';
  for (const c of [...chunks.map((ch) => s.push(ch)), s.flush()]) {
    text += c.text;
    thinking += c.thinking;
  }
  return { text, thinking };
}

describe('ThinkTagSplitter', () => {
  it('deja pasar el texto sin etiquetas tal cual', () => {
    expect(run(['Hola, ', '¿qué tal? <3'])).toEqual({ text: 'Hola, ¿qué tal? <3', thinking: '' });
  });

  it('separa <think> y <thinking> sin importar mayúsculas', () => {
    expect(run(['<THINK>a</THINK>Hola'])).toEqual({ text: 'Hola', thinking: 'a' });
    expect(run(['<thinking>b</thinking> Adiós'])).toEqual({ text: 'Adiós', thinking: 'b' });
  });

  it('reconstruye etiquetas partidas en cualquier punto', () => {
    const full = '<think>razono</think>\nRespuesta final';
    for (let i = 1; i < full.length; i++) {
      expect(run([full.slice(0, i), full.slice(i)])).toEqual({ text: 'Respuesta final', thinking: 'razono' });
    }
  });

  it('un bloque sin cerrar al terminar cuenta como razonamiento', () => {
    expect(run(['<think>sin cerrar'])).toEqual({ text: '', thinking: 'sin cerrar' });
  });

  it('no retiene para siempre un "<" que no es etiqueta', () => {
    const s = new ThinkTagSplitter();
    expect(s.push('a <b').text).toBe('a <b');
    expect(s.push('2 < 3 <t').text).toBe('2 < 3 ');
    expect(s.push('ras').text).toBe('<tras');
  });
});
