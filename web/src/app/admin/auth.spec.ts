import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, UrlTree, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminApi, API_BASE_URL, SESSION_STORAGE } from './api';
import { AdminAuth, adminGuard, permissionGuard } from './auth';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

type Handler = (init: RequestInit & { headers: Record<string, string> }) => [number, unknown];

/** Servidor falso: ruta "MÉTODO /path" → respuesta. Guarda las peticiones para inspeccionarlas. */
function fakeServer(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit & { headers: Record<string, string> } }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    const key = `${init.method ?? 'GET'} ${url.replace('http://api.test', '')}`;
    calls.push({ key, init });
    const handler = routes[key];
    const [status, body] = handler ? handler(init) : [404, { message: 'no route' }];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const tokens = (n = 1) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}` });
const me = (role: string, permissions: string[]) => ({ id: 'u1', email: 'sa@petai.local', displayName: 'SA', role, permissions });
const SUPERADMIN = me('superadmin', ['admin:access', 'users:read', 'users:role:assign']);

describe('sesión del panel contra el backend', () => {
  let session: Storage;

  beforeEach(() => {
    session = memoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
        { provide: SESSION_STORAGE, useValue: session },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const runGuard = () =>
    TestBed.runInInjectionContext(() => (adminGuard as (...args: unknown[]) => Promise<unknown>)({} as Route, []));

  it('entra con un rol que tiene acceso al panel', async () => {
    const calls = fakeServer({
      'POST /v1/auth/login': () => [200, { ...tokens(), user: {} }],
      'GET /v1/me': () => [200, SUPERADMIN],
    });
    const auth = TestBed.inject(AdminAuth);

    expect(await auth.login(' sa@petai.local ', 'Password123!')).toBeNull();
    expect(auth.authenticated()).toBe(true);
    expect(auth.can('users:role:assign')).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'sa@petai.local', password: 'Password123!' });
    expect(calls[1].init.headers['Authorization']).toBe('Bearer access-1');
    expect(session.getItem('pockai.admin.session')).toContain('access-1');
  });

  it('rechaza credenciales incorrectas', async () => {
    fakeServer({ 'POST /v1/auth/login': () => [401, { message: 'Credenciales inválidas' }] });
    const auth = TestBed.inject(AdminAuth);
    expect(await auth.login('x@petai.local', 'mal')).toBe('Correo o contraseña incorrectos.');
    expect(auth.authenticated()).toBe(false);
  });

  it('un usuario sin permiso de panel no entra y su sesión se cierra en el servidor', async () => {
    const calls = fakeServer({
      'POST /v1/auth/login': () => [200, tokens()],
      'GET /v1/me': () => [200, me('user', [])],
      'POST /v1/auth/logout': () => [200, { ok: true }],
    });
    const auth = TestBed.inject(AdminAuth);
    expect(await auth.login('u@petai.local', 'Password123!')).toBe('Tu cuenta no tiene acceso al panel.');
    expect(auth.authenticated()).toBe(false);
    expect(calls.map((c) => c.key)).toContain('POST /v1/auth/logout');
    expect(session.getItem('pockai.admin.session')).toBeNull();
  });

  it('el guard manda al login sin sesión', async () => {
    fakeServer({});
    const redirect = await runGuard();
    expect(redirect).toBeInstanceOf(UrlTree);
    expect(String(redirect)).toBe('/admin/login');
  });

  it('el guard revalida el rol: si lo han degradado, fuera', async () => {
    session.setItem('pockai.admin.session', JSON.stringify({ ...tokens(), user: SUPERADMIN }));
    fakeServer({ 'GET /v1/me': () => [200, me('user', [])] });
    expect(String(await runGuard())).toBe('/admin/login');
  });

  it('el guard deja pasar si el rol sigue teniendo acceso', async () => {
    session.setItem('pockai.admin.session', JSON.stringify({ ...tokens(), user: SUPERADMIN }));
    fakeServer({ 'GET /v1/me': () => [200, SUPERADMIN] });
    expect(await runGuard()).toBe(true);
  });

  it('renueva el access token ante un 401 y repite la petición', async () => {
    session.setItem('pockai.admin.session', JSON.stringify({ ...tokens(1), user: SUPERADMIN }));
    let meCalls = 0;
    fakeServer({
      'GET /v1/me': (init) => {
        meCalls++;
        return init.headers['Authorization'] === 'Bearer access-2' ? [200, SUPERADMIN] : [401, {}];
      },
      'POST /v1/auth/refresh': (init) =>
        JSON.parse(String(init.body)).refreshToken === 'refresh-1' ? [200, tokens(2)] : [401, {}],
    });
    expect(await TestBed.inject(AdminApi).request('/v1/me')).toEqual(SUPERADMIN);
    expect(meCalls).toBe(2);
    expect(session.getItem('pockai.admin.session')).toContain('refresh-2');
  });

  it('si el refresh falla, cierra la sesión local', async () => {
    session.setItem('pockai.admin.session', JSON.stringify({ ...tokens(1), user: SUPERADMIN }));
    fakeServer({ 'GET /v1/me': () => [401, {}], 'POST /v1/auth/refresh': () => [401, {}] });
    const api = TestBed.inject(AdminApi);
    await expect(api.request('/v1/me')).rejects.toThrow('La sesión ha caducado');
    expect(api.session()).toBeNull();
  });

  it('cerrar sesión revoca el refresh token', async () => {
    session.setItem('pockai.admin.session', JSON.stringify({ ...tokens(), user: SUPERADMIN }));
    const calls = fakeServer({ 'POST /v1/auth/logout': () => [200, { ok: true }] });
    const auth = TestBed.inject(AdminAuth);
    await auth.logout();
    expect(auth.authenticated()).toBe(false);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refreshToken: 'refresh-1' });
  });

  it('el guard por sección deja pasar con el permiso y si no manda al resumen', () => {
    session.setItem('pockai.admin.session', JSON.stringify({ ...tokens(), user: me('moderator', ['admin:access', 'audit:read']) }));
    const run = (permission: string) =>
      TestBed.runInInjectionContext(() =>
        (permissionGuard as (...args: unknown[]) => unknown)({ data: { permission } } as unknown as ActivatedRouteSnapshot, {}),
      );
    expect(run('audit:read')).toBe(true);
    const denied = run('economy:manage');
    expect(denied).toBeInstanceOf(UrlTree);
    expect(String(denied)).toBe('/admin/resumen');
  });
});
