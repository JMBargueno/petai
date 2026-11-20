import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
class FakeChannel<T> {
  onmessage: (message: T) => void = () => {};
}
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: FakeChannel,
}));

import { chatTurn, coreStream, perform, query } from './index';

const BASE = 'http://127.0.0.1:3000';

describe('coreStream', () => {
  beforeEach(() => invoke.mockReset());

  it('entrega los eventos del canal y cancela en el núcleo al abortar', async () => {
    const abort = new AbortController();
    const received: string[] = [];
    invoke.mockImplementation(async (name: string, args: any) => {
      if (name === 'plugin:pockai|chat_stream') {
        args.onEvent.onmessage({ event: 'delta', data: '{"text":"Ho"}' });
        abort.abort();
        throw 'cancelado';
      }
      return undefined;
    });

    const pending = coreStream(
      `${BASE}/v1/pets/p1/chat`,
      { method: 'POST', body: '{}', headers: { Authorization: 'Bearer core' }, signal: abort.signal },
      (e) => received.push(e.event),
    );

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(received).toEqual(['delta']);
    // La cancelación sale hacia el núcleo en segundo plano.
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('plugin:pockai|chat_cancel', expect.anything()));
    const cancel = invoke.mock.calls.find(([name]) => name === 'plugin:pockai|chat_cancel');
    const stream = invoke.mock.calls.find(([name]) => name === 'plugin:pockai|chat_stream');
    expect(cancel?.[1].id).toBe(stream?.[1].id);
  });
});

describe('acciones y consultas', () => {
  beforeEach(() => invoke.mockReset());

  it('piden al núcleo lo que quieren con su tipo, sin rutas', async () => {
    invoke.mockResolvedValue({ id: 'p1' });

    const pet = await perform({ type: 'feed', petId: 'p1', itemId: 'apple' });
    await query({ type: 'getBattles', limit: 20 });

    expect(pet).toEqual({ id: 'p1' });
    expect(invoke.mock.calls).toEqual([
      ['plugin:pockai|perform', { action: { type: 'feed', petId: 'p1', itemId: 'apple' } }],
      ['plugin:pockai|query', { query: { type: 'getBattles', limit: 20 } }],
    ]);
  });
});

describe('chatTurn', () => {
  beforeEach(() => invoke.mockReset());

  /** El núcleo responde al turno emitiendo `events` por el canal y luego `status`. */
  function coreReplies(events: { event: string; data: unknown }[], status = 200, body = '{}') {
    invoke.mockImplementation(async (name: string, args: any) => {
      if (name !== 'plugin:pockai|chat_stream') return undefined;
      for (const e of events) args.onEvent.onmessage({ event: e.event, data: JSON.stringify(e.data) });
      return { status, headers: {}, body };
    });
  }

  it('reparte los trozos, se resuelve con `done` y manda el mensaje con la ruta del chat', async () => {
    coreReplies([
      { event: 'delta', data: { text: 'Ho' } },
      { event: 'reasoning', data: { text: 'pienso' } },
      { event: 'tool', data: { name: 'clima' } },
      { event: 'action', data: { action: { id: 'a1', tool: 't', summary: 'Algo', expiresAt: '' } } },
      { event: 'delta', data: { text: 'la' } },
      { event: 'done', data: { message: { id: 'm1', content: 'Hola' } } },
    ]);
    const deltas: string[] = [];
    const seen: string[] = [];
    const done = await chatTurn('p1', 'hola', {
      onDelta: (t) => deltas.push(t),
      onReasoning: () => seen.push('reasoning'),
      onTool: (n) => seen.push(`tool:${n}`),
      onAction: (a) => seen.push(`action:${a.id}`),
    }, { clientTools: ['open_url'] });

    expect(deltas).toEqual(['Ho', 'la']);
    expect(seen).toEqual(['reasoning', 'tool:clima', 'action:a1']);
    expect(done).toEqual({ message: { id: 'm1', content: 'Hola' } });
    const request = invoke.mock.calls.find(([name]) => name === 'plugin:pockai|chat_stream')?.[1].request;
    expect(request).toMatchObject({ method: 'POST', path: '/v1/pets/p1/chat', auth: true });
    expect(JSON.parse(request.body)).toMatchObject({ message: 'hola', clientTools: ['open_url'] });
  });

  it('un mensaje moderado se resuelve como tal y avisa', async () => {
    coreReplies([{ event: 'moderated', data: { reason: 'x', message: 'Mejor no', hideUserMessage: true } }]);
    const moderated: string[] = [];
    const done = await chatTurn('p1', '…', { onDelta: () => {}, onModerated: (m) => moderated.push(m.message) });
    expect(done).toEqual({ moderated: true });
    expect(moderated).toEqual(['Mejor no']);
  });

  it('un evento `error` rechaza con su mensaje', async () => {
    coreReplies([{ event: 'error', data: { message: 'Key rechazada' } }]);
    await expect(chatTurn('p1', 'hola', { onDelta: () => {} })).rejects.toThrow('Key rechazada');
  });

  it('si el servidor no abre el flujo, rechaza con su mensaje y su estado', async () => {
    coreReplies([], 429, JSON.stringify({ message: 'Cuota agotada' }));
    await expect(chatTurn('p1', 'hola', { onDelta: () => {} })).rejects.toMatchObject({ message: 'Cuota agotada', status: 429 });
  });
});
