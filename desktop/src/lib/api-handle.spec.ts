import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, onEmailUnverified, onHandleRequired, setAccessToken } from './api';
import { atHandle, handleFormatError, normalizeHandle } from './handle';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const requestOf = (call: unknown[]) => {
  const input = call[0] as RequestInfo | URL;
  return input instanceof Request ? input : new Request(String(input), call[1] as RequestInit);
};

describe('handle: reglas del nickname en el cliente', () => {
  it('normaliza y valida igual que el servidor', () => {
    expect(normalizeHandle('  @JMBargueno ')).toBe('jmbargueno');
    expect(handleFormatError('dada')).toBeNull();
    expect(handleFormatError('ab')).toContain('3');
    expect(handleFormatError('1abc')).toContain('letra');
    expect(handleFormatError('a-b-c')).toContain('Solo');
    expect(handleFormatError('ab..c')).toContain('dos puntos');
    expect(handleFormatError('abc.')).toContain('punto');
    expect(atHandle('dada')).toBe('@dada');
    expect(atHandle(null)).toBe('');
  });
});

describe('api: nickname', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('un 403 HANDLE_REQUIRED avisa a la app (y no como correo sin verificar)', async () => {
    setAccessToken('token-de-prueba');
    const fetchMock = vi.fn(async () => json(403, { statusCode: 403, code: 'HANDLE_REQUIRED', message: 'Elige tu nickname' }));
    vi.stubGlobal('fetch', fetchMock);
    const needsHandle = vi.fn();
    const unverified = vi.fn();
    const stopA = onHandleRequired(needsHandle);
    const stopB = onEmailUnverified(unverified);

    await expect(api.getPets()).rejects.toThrow();
    expect(needsHandle).toHaveBeenCalledTimes(1);
    expect(unverified).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
  });

  it('el registro envía el nickname', async () => {
    const fetchMock = vi.fn(async () => json(201, { accessToken: 'a', refreshToken: 'r', user: { handle: 'dada' } }));
    vi.stubGlobal('fetch', fetchMock);
    await api.register('a@b.c', 'Password123!', undefined, undefined, 'dada');
    const body = await requestOf(fetchMock.mock.calls[0] as unknown[]).json();
    expect(body).toMatchObject({ email: 'a@b.c', handle: 'dada' });
  });

  it('checkHandleAvailable consulta el endpoint público y ante un fallo de red no da el nickname por libre', async () => {
    const fetchMock = vi.fn(async () => json(200, { handle: 'dada', available: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.checkHandleAvailable('dada')).resolves.toEqual({ handle: 'dada', available: true });
    const url = new URL(requestOf(fetchMock.mock.calls[0] as unknown[]).url);
    expect(url.pathname).toBe('/v1/auth/handle-available');
    expect(url.searchParams.get('handle')).toBe('dada');

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(api.checkHandleAvailable('dada')).resolves.toMatchObject({ available: false });
  });

  it('setMyHandle hace POST /me/handle y propaga el mensaje del 409', async () => {
    setAccessToken('token-de-prueba');
    const fetchMock = vi.fn(async () => json(409, { statusCode: 409, message: 'Ese nickname ya está en uso' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.setMyHandle('dada')).rejects.toThrow('Ese nickname ya está en uso');
    const req = requestOf(fetchMock.mock.calls[0] as unknown[]);
    expect(req.method).toBe('POST');
    expect(new URL(req.url).pathname).toBe('/v1/me/handle');
    expect(await req.json()).toEqual({ handle: 'dada' });
  });

  it('pedir amistad e invitar al clan van por nickname', async () => {
    setAccessToken('token-de-prueba');
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await api.requestCoopFriend({ handle: 'dada' });
    await api.inviteToClan('clan-1', { handle: 'dada' });
    for (const call of fetchMock.mock.calls) {
      const req = requestOf(call as unknown[]);
      expect(await req.json()).toEqual({ handle: 'dada' });
    }
  });
});
