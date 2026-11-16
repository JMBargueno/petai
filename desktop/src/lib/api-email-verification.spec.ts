import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, onEmailUnverified, onSessionExpired, setAccessToken } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api: cuenta sin verificar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('un 403 EMAIL_NOT_VERIFIED avisa a la app y no intenta renovar el token ni cerrar sesión', async () => {
    setAccessToken('token-de-prueba');
    const fetchMock = vi.fn(async () => json(403, { statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Verifica tu correo' }));
    vi.stubGlobal('fetch', fetchMock);
    const unverified = vi.fn();
    const expired = vi.fn();
    const stopA = onEmailUnverified(unverified);
    const stopB = onSessionExpired(expired);

    await expect(api.getPets()).rejects.toThrow();
    expect(unverified).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
    // Una sola petición: sin refresh ni reintento
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
  });

  it('otros 403 no se tratan como falta de verificación', async () => {
    setAccessToken('token-de-prueba');
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { statusCode: 403, message: 'Sin permiso' })));
    const unverified = vi.fn();
    const stop = onEmailUnverified(unverified);
    await expect(api.getPets()).rejects.toThrow();
    expect(unverified).not.toHaveBeenCalled();
    stop();
  });

  it('con el access token caducado, verifyEmail renueva la sesión y reintenta', async () => {
    // Sesión con refresh token (login simulado)
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { accessToken: 'viejo', refreshToken: 'refresh-1', user: {} })));
    await api.login('a@b.c', 'x');

    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const req = input instanceof Request ? input : new Request(String(input));
        const path = new URL(req.url, 'http://x').pathname;
        calls.push(`${path} ${req.headers.get('Authorization') ?? ''}`);
        if (path === '/v1/auth/refresh') return json(200, { accessToken: 'nuevo', refreshToken: 'refresh-2' });
        return req.headers.get('Authorization') === 'Bearer nuevo'
          ? json(200, { ok: true, emailVerified: true })
          : json(401, { statusCode: 401, message: 'Unauthorized' });
      }),
    );

    await expect(api.verifyEmail('123456')).resolves.toEqual({ ok: true, emailVerified: true });
    expect(calls).toEqual([
      '/v1/auth/verify-email/confirm Bearer viejo',
      '/v1/auth/refresh ',
      '/v1/auth/verify-email/confirm Bearer nuevo',
    ]);
    api.logout();
  });

  it('verifyEmail envía el código recortado al endpoint de confirmación', async () => {
    setAccessToken('token-de-prueba');
    const fetchMock = vi.fn(async (_req: Request) => json(200, { ok: true, emailVerified: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.verifyEmail(' 123456 ')).resolves.toEqual({ ok: true, emailVerified: true });
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(new URL(req.url).pathname).toBe('/v1/auth/verify-email/confirm');
    expect(await req.json()).toEqual({ code: '123456' });
  });
});
