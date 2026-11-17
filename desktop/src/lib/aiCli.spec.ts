import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCliPrompt,
  CliOutputReader,
  loadCliConfig,
  parseClaudeStreamLine,
  saveCliConfig,
  stripAnsi,
} from './aiCli';

const ev = (o: unknown) => JSON.stringify(o) + '\n';
const textDelta = (text: string) =>
  ev({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });

describe('buildCliPrompt', () => {
  it('separa el system y convierte el historial en transcripción', () => {
    const out = buildCliPrompt([
      { role: 'system', content: 'Eres Chispa, un Pockai.' },
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola, dueño!' },
      { role: 'user', content: '¿qué tal?' },
    ]);
    expect(out.system).toBe('Eres Chispa, un Pockai.');
    expect(out.prompt).toContain('Dueño: hola');
    expect(out.prompt).toContain('Tú: ¡Hola, dueño!');
    expect(out.prompt).toContain('Nuevo mensaje de tu dueño: ¿qué tal?');
    expect(out.prompt).not.toContain('Dueño: ¿qué tal?');
  });

  it('recorta el historial antiguo y conserva el más reciente', () => {
    const long = 'x'.repeat(2500);
    const out = buildCliPrompt([
      { role: 'system', content: 'S' },
      { role: 'user', content: `viejo ${long}` },
      { role: 'assistant', content: `medio ${long}` },
      { role: 'user', content: `reciente ${long}` },
      { role: 'assistant', content: 'último' },
      { role: 'user', content: 'ahora' },
    ]);
    expect(out.prompt).not.toContain('viejo');
    expect(out.prompt).toContain('reciente');
    expect(out.prompt).toContain('Tú: último');
    expect(out.prompt).toContain('Nuevo mensaje de tu dueño: ahora');
  });

  it('une varios mensajes de sistema', () => {
    const out = buildCliPrompt([
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'x' },
    ]);
    expect(out.system).toBe('A\n\nB');
    expect(out.prompt).not.toContain('Conversación hasta ahora');
  });
});

describe('parseClaudeStreamLine', () => {
  it('extrae deltas de texto y de razonamiento', () => {
    expect(parseClaudeStreamLine(textDelta('Hola'))).toEqual({ delta: 'Hola' });
    expect(
      parseClaudeStreamLine(
        ev({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } } }),
      ),
    ).toEqual({ thinking: 'hmm' });
  });

  it('lee el resultado final y los errores', () => {
    expect(parseClaudeStreamLine(ev({ type: 'result', subtype: 'success', is_error: false, result: 'Hola' }))).toEqual({
      final: 'Hola',
    });
    expect(parseClaudeStreamLine(ev({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in' }))).toEqual({
      error: 'Not logged in',
    });
  });

  it('ignora líneas de otro tipo o que no son JSON', () => {
    expect(parseClaudeStreamLine(ev({ type: 'system', subtype: 'init' }))).toEqual({});
    expect(parseClaudeStreamLine('warning: algo')).toEqual({});
    expect(parseClaudeStreamLine('{roto')).toEqual({});
  });
});

describe('CliOutputReader', () => {
  it('Claude: reensambla líneas partidas y emite solo la respuesta', () => {
    const deltas: string[] = [];
    const r = new CliOutputReader('claude', (d) => deltas.push(d));
    const raw =
      ev({ type: 'system', subtype: 'init' }) +
      textDelta('<think>pienso</think>¡Ho') +
      textDelta('la!') +
      ev({ type: 'result', subtype: 'success', is_error: false, result: '¡Hola!' });
    for (const piece of raw.match(/[\s\S]{1,9}/g)!) r.push(piece);
    expect(r.finish()).toEqual({ reply: '¡Hola!', thinking: 'pienso' });
    expect(deltas.join('')).toBe('¡Hola!');
  });

  it('Claude: sin deltas usa el resultado final', () => {
    const deltas: string[] = [];
    const r = new CliOutputReader('claude', (d) => deltas.push(d));
    r.push(ev({ type: 'result', subtype: 'success', is_error: false, result: 'Solo final' }));
    expect(r.finish().reply).toBe('Solo final');
    expect(deltas).toEqual(['Solo final']);
  });

  it('Claude: un resultado con error lanza', () => {
    const r = new CliOutputReader('claude', () => {});
    r.push(ev({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '' }));
    expect(() => r.finish()).toThrow(/error_during_execution/);
  });

  it('Antigravity: texto plano sin códigos ANSI', () => {
    const deltas: string[] = [];
    const r = new CliOutputReader('antigravity', (d) => deltas.push(d));
    r.push('\u001b[32m¡Hola');
    r.push(', dueño!\u001b[0m\n');
    expect(r.finish()).toEqual({ reply: '¡Hola, dueño!', thinking: '' });
  });
});

describe('stripAnsi', () => {
  it('quita colores y títulos de terminal', () => {
    expect(stripAnsi('\u001b[1;31mrojo\u001b[0m \u001b]0;titulo\u0007ok')).toBe('rojo ok');
  });
});

describe('config CLI', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });

  it('guarda y recupera la configuración', () => {
    expect(loadCliConfig()).toEqual({ engine: null, model: '', binPath: '' });
    saveCliConfig({ engine: 'claude', model: 'sonnet', binPath: '' });
    expect(loadCliConfig()).toEqual({ engine: 'claude', model: 'sonnet', binPath: '' });
  });

  it('descarta motores desconocidos', () => {
    localStorage.setItem('petai_ai_cli', JSON.stringify({ engine: 'rm -rf', model: 1 }));
    expect(loadCliConfig()).toEqual({ engine: null, model: '', binPath: '' });
  });
});
