import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
/** Simula que el núcleo no llega al servidor: `invoke` de Tauri rechaza con el texto del error. */
let offline = false;
class FakeChannel<T> {
  onmessage: (message: T) => void = () => {};
}
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => (offline ? Promise.reject('sin conexión con el servidor') : invoke(...args)),
  Channel: FakeChannel,
}));

import { coreFetch, coreStream } from './index';

const BASE = 'http://127.0.0.1:3000';

describe('coreFetch', () => {
  beforeEach(() => {
    invoke.mockReset();
    offline = false;
  });

  it('describe la llamada al núcleo sin mandarle el token', async () => {
    invoke.mockResolvedValue({ status: 200, body: '{"ok":true}', headers: { 'content-type': 'application/json' } });

    const res = await coreFetch(`${BASE}/v1/pets?limit=5`, { headers: { Authorization: 'Bearer core' } });

    expect(invoke).toHaveBeenCalledWith('plugin:pockai|api_request', {
      request: { method: 'GET', path: '/v1/pets?limit=5', body: null, auth: true, contentType: null },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('manda el cuerpo y marca sin sesión las llamadas públicas', async () => {
    invoke.mockResolvedValue({ status: 201, body: '{}', headers: {} });

    await coreFetch(`${BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c' }),
    });

    expect(invoke.mock.calls[0][1].request).toEqual({
      method: 'POST',
      path: '/v1/auth/login',
      body: '{"email":"a@b.c"}',
      auth: false,
      contentType: 'application/json',
    });
  });

  it('devuelve los errores HTTP como respuesta, igual que fetch', async () => {
    invoke.mockResolvedValue({ status: 403, body: '{"code":"HANDLE_REQUIRED"}', headers: {} });
    const res = await coreFetch(`${BASE}/v1/pets`);
    expect(res.ok).toBe(false);
    expect((await res.json()).code).toBe('HANDLE_REQUIRED');
  });

  it('una respuesta sin contenido no lleva cuerpo', async () => {
    invoke.mockResolvedValue({ status: 204, body: '', headers: {} });
    const res = await coreFetch(`${BASE}/v1/reminders/1`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });

  it('sin conexión lanza TypeError, igual que fetch', async () => {
    offline = true;
    await expect(coreFetch(`${BASE}/v1/pets`)).rejects.toBeInstanceOf(TypeError);
  });

  it('no llama al núcleo si la petición ya estaba cancelada', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(coreFetch(`${BASE}/v1/pets`, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

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
