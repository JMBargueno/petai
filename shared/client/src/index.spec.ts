import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
class FakeChannel<T> {
  onmessage: (message: T) => void = () => {};
}
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: FakeChannel,
}));

import { coreStream, perform, query } from './index';

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
