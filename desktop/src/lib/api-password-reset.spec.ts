import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, getAccessToken, setAccessToken } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api: recuperar contraseña', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('requestPasswordReset envía el correo (recortado) al endpoint público', async () => {
    const fetchMock = vi.fn(async (_req: Request) => json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await api.requestPasswordReset('  ana@example.com ');
    // apiFetch manda un único Request, con las cabeceras del cliente ya puestas
    const req = fetchMock.mock.calls[0][0];
    expect(req.url).toMatch(/\/v1\/auth\/reset\/request$/);
    expect(await req.json()).toEqual({ email: 'ana@example.com' });
  });

  it('confirmPasswordReset guarda la sesión que devuelve el servidor', async () => {
    const fetchMock = vi.fn(async (_req: Request) =>
      json(200, { ok: true, accessToken: 'acceso-nuevo', refreshToken: 'refresh-nuevo', user: { id: 'u1', emailVerified: true } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await api.confirmPasswordReset('ana@example.com', ' 123456 ', 'NuevaContrasena-1');
    expect(res.user.emailVerified).toBe(true);
    expect(getAccessToken()).toBe('acceso-nuevo');
    const req = fetchMock.mock.calls[0][0];
    expect(req.url).toMatch(/\/v1\/auth\/reset\/confirm$/);
    expect(await req.json()).toEqual({ email: 'ana@example.com', code: '123456', newPassword: 'NuevaContrasena-1' });
  });

  it('un código inválido lanza el mensaje del servidor y no inicia sesión', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { statusCode: 400, message: 'Código inválido o caducado' })));
    const err = await api.confirmPasswordReset('ana@example.com', '000000', 'NuevaContrasena-1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Código inválido o caducado');
    expect(err.status).toBe(400);
    expect(getAccessToken()).toBeNull();
  });

  it('sin conexión da un mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(api.requestPasswordReset('ana@example.com')).rejects.toThrow(/Sin conexión/);
  });
});
