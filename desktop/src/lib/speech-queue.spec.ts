import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  GAP_MS,
  MAX_QUEUE,
  createSpeechQueue,
  durationFor,
  splitForSpeech,
  toSpeakable,
} from './speech-queue';

describe('splitForSpeech', () => {
  it('deja intacto un texto corto', () => {
    expect(splitForSpeech('¡Hola!')).toEqual(['¡Hola!']);
  });

  it('trocea por frases sin pasar del máximo', () => {
    const text = 'Primera frase bastante larga. Segunda frase también larga! ¿Tercera? Cuarta y última.';
    const chunks = splitForSpeech(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(40);
    expect(chunks.join(' ')).toBe(text);
  });

  it('parte por palabras una frase demasiado larga', () => {
    const text = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ');
    const chunks = splitForSpeech(text, 50);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(50);
    expect(chunks.join(' ')).toBe(text);
  });

  it('respeta los saltos de línea como cortes', () => {
    expect(splitForSpeech('uno\ndos', 160)).toEqual(['uno dos']);
    expect(splitForSpeech('', 160)).toEqual([]);
  });
});

describe('toSpeakable', () => {
  it('quita el razonamiento <think> y el markdown', () => {
    expect(toSpeakable('<think>pienso cosas</think>**Hola** `mundo`')).toBe('Hola mundo');
    expect(toSpeakable('- uno\n- dos\n# Título')).toBe('uno\ndos\nTítulo');
    expect(toSpeakable('mira [esto](http://x.y)')).toBe('mira esto');
    expect(toSpeakable('nombre_de_archivo')).toBe('nombre_de_archivo');
  });
});

describe('createSpeechQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('muestra los mensajes de uno en uno, en orden', () => {
    const q = createSpeechQueue();
    q.speak('uno', { durationMs: 1000 });
    q.speak('dos', { durationMs: 1000 });
    expect(get(q.current)?.text).toBe('uno');
    vi.advanceTimersByTime(1000);
    expect(get(q.current)).toBeNull(); // pausa entre mensajes
    vi.advanceTimersByTime(GAP_MS);
    expect(get(q.current)?.text).toBe('dos');
    vi.advanceTimersByTime(1000);
    expect(get(q.current)).toBeNull();
    expect(q.busy()).toBe(false);
  });

  it('los textos largos se dicen en varios bocadillos', () => {
    const q = createSpeechQueue();
    const long = 'Frase número uno con algo de texto. '.repeat(10);
    q.speak(long);
    expect(q.pending()).toBeGreaterThan(0);
    expect(get(q.current)!.text.length).toBeLessThanOrEqual(160);
  });

  it('el relleno (low) no entra si hay algo en curso', () => {
    const q = createSpeechQueue();
    q.speak('importante', { durationMs: 1000 });
    expect(q.speak('bark', { priority: 'low' })).toBe(false);
    vi.advanceTimersByTime(1000 + GAP_MS);
    expect(q.speak('bark', { priority: 'low' })).toBe(true);
  });

  it('high se antepone a lo pendiente y corta el relleno', () => {
    const q = createSpeechQueue();
    q.speak('bark', { priority: 'low', durationMs: 5000 });
    q.speak('normal', { durationMs: 1000 });
    q.speak('urgente', { priority: 'high', durationMs: 1000 });
    expect(get(q.current)).toBeNull(); // se cortó el bark
    vi.advanceTimersByTime(GAP_MS);
    expect(get(q.current)?.text).toBe('urgente');
    vi.advanceTimersByTime(1000 + GAP_MS);
    expect(get(q.current)?.text).toBe('normal');
  });

  it('deduplica por clave', () => {
    const q = createSpeechQueue();
    expect(q.speak('a', { key: 'k' })).toBe(true);
    expect(q.speak('b', { key: 'k' })).toBe(false);
  });

  it('limita la cola por mensajes completos, descartando lo más antiguo', () => {
    const q = createSpeechQueue();
    q.speak('actual', { durationMs: 1000 });
    for (let i = 0; i < MAX_QUEUE + 5; i++) q.speak(`n${i}`, { durationMs: 1000 });
    expect(q.pending()).toBe(MAX_QUEUE);
    vi.advanceTimersByTime(1000 + GAP_MS);
    expect(get(q.current)?.text).toBe('n5');
  });

  it('una respuesta larga se dice desde el principio, en orden y sin perder trozos por el límite', () => {
    const q = createSpeechQueue();
    const sentences = Array.from({ length: 30 }, (_, i) => `Esta es la frase número ${i} de una respuesta larga.`);
    q.speak(sentences.join(' '), { maxChunks: 40 });
    const first = get(q.current)!;
    expect(first.text.startsWith('Esta es la frase número 0 ')).toBe(true);
    q.speak('otro mensaje');
    vi.advanceTimersByTime(first.durationMs + GAP_MS);
    expect(get(q.current)!.text).toContain('número 3'); // segundo trozo
    // Ningún trozo del mensaje en curso se ha descartado
    expect(q.pending()).toBeGreaterThan(5);
  });

  it('recorta los mensajes enormes y lo indica en el último bocadillo', () => {
    const q = createSpeechQueue();
    const long = 'Frase de relleno bastante larga para trocear. '.repeat(60);
    q.speak(long, { maxChunks: 3, overflowNote: '(sigue en el chat)' });
    expect(q.pending()).toBe(2);
    let last = '';
    for (let i = 0; i < 3; i++) {
      last = get(q.current)!.text;
      expect(last.length).toBeLessThanOrEqual(160);
      vi.advanceTimersByTime(get(q.current)!.durationMs + GAP_MS);
    }
    expect(last.endsWith('(sigue en el chat)')).toBe(true);
  });

  it('descarta las reacciones caducadas que no llegaron a mostrarse', () => {
    const q = createSpeechQueue();
    q.speak('largo', { durationMs: 10_000 });
    q.speak('¡Mmmm, qué rico!', { maxWaitMs: 3000 });
    q.speak('después');
    vi.advanceTimersByTime(10_000 + GAP_MS);
    expect(get(q.current)?.text).toBe('después');
  });

  it('llama a onShow al mostrar y clear vacía todo', () => {
    const q = createSpeechQueue();
    const onShow = vi.fn();
    q.speak('a', { durationMs: 1000 });
    q.speak('b', { onShow });
    expect(onShow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000 + GAP_MS);
    expect(onShow).toHaveBeenCalledOnce();
    q.clear();
    expect(get(q.current)).toBeNull();
    expect(q.busy()).toBe(false);
  });

  it('la duración crece con la longitud y está acotada', () => {
    expect(durationFor('hola')).toBe(3000);
    expect(durationFor('x'.repeat(1000))).toBe(12000);
  });
});
