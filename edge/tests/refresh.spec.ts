/**
 * Tests del edge de auth refresh (feature 009-edge-cdn, US3/T017).
 *
 * Simula el worker con miniflare/node (fetch mockeado para JWKS + origin):
 *   - fast-path: refresh JWT fast-path válido (RS256) → 200 { accessToken, refreshToken, user }
 *     SIN tocar el origin.
 *   - token expirado/inválido → fallback al origin (1 llamada).
 *   - origin caído → 502 con mensaje claro.
 *   - refreshToken ausente → 400.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { webcrypto, createPublicKey } from 'node:crypto';
import { SignJWT } from 'jose';
import worker, { type Env } from '../worker';

const JWKS_URL = 'http://jwks.test/jwks.json';
const ORIGIN_URL = 'http://origin.test';
const ACCESS_SECRET = 'a'.repeat(32);

let privateKey: CryptoKey;
let jwkKeys: Array<Record<string, unknown>>;

const env: Env = {
  ORIGIN_URL,
  JWT_PUBLIC_KEY_JWKS_URL: JWKS_URL,
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_ACCESS_EXPIRES_IN: '15m',
};

let originCalls = 0;
let originMode: 'ok' | 'down' = 'ok';

beforeAll(async () => {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'RSA', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = keyPair.privateKey;
  const spki = await webcrypto.subtle.exportKey('spki', keyPair.publicKey);
  const jwk = createPublicKey(Buffer.from(spki)).export({ format: 'jwk' }) as {
    kty: string;
    n: string;
    e: string;
  };
  jwkKeys = [{ kty: jwk.kty, n: jwk.n, e: jwk.e, use: 'sig', alg: 'RS256', kid: 'test' }];
});

afterAll(() => {
  vi.restoreAllMocks();
});

/** Firma un refresh JWT fast-path (RS256) con los claims del contrato. */
async function makeRefreshToken(
  sub: string,
  email: string,
  displayName: string,
  opts: { expOffsetSec?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.expOffsetSec ?? 24 * 3600);
  return new SignJWT({ email, displayName, jti: `jti-${sub}`, typ: 'refresh' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);
}

function postRefresh(refreshToken: string | null): Request {
  return new Request('https://edge.test/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken === null ? {} : { refreshToken }),
  });
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** Mock de fetch global: sirve el JWKS y simula el origin. */
function installFetchMock() {
  originCalls = 0;
  originMode = 'ok';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url);
      if (url.startsWith(JWKS_URL)) {
        return new Response(JSON.stringify({ keys: jwkKeys }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.startsWith(ORIGIN_URL)) {
        originCalls++;
        if (originMode === 'down') throw new Error('origin down');
        return new Response(
          JSON.stringify({
            accessToken: 'origin-access',
            refreshToken: 'origin-refresh',
            user: { id: 'user-1', email: 'x@y.z', displayName: 'X' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`fetch inesperada: ${url}`);
    }),
  );
}

describe('edge auth refresh (miniflare)', () => {
  it('fast-path: refresh fast-path válido → 200 sin tocar origin', async () => {
    installFetchMock();
    const token = await makeRefreshToken('user-1', 'x@y.z', 'X');
    const res = await worker.fetch(postRefresh(token), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.refreshToken).toBe(token); // el edge no rota (sin clave privada)
    expect(data.user).toMatchObject({ id: 'user-1', email: 'x@y.z', displayName: 'X' });
    const access = decodePayload(data.accessToken);
    expect(access.typ).toBe('access');
    expect(access.sub).toBe('user-1');
    expect(access.exp).toBeGreaterThan(access.iat);
    expect(originCalls).toBe(0); // fast-path: origin NO consultado
  });

  it('refresh expirado → fallback transparente al origin', async () => {
    installFetchMock();
    const token = await makeRefreshToken('user-1', 'x@y.z', 'X', { expOffsetSec: -100 });
    const before = originCalls;
    const res = await worker.fetch(postRefresh(token), env, {});
    expect(res.status).toBe(200);
    expect(originCalls).toBe(before + 1); // sí reenvió al origin
    const data = await res.json();
    expect(data.accessToken).toBe('origin-access');
  });

  it('token no-JWT → fallback; origin caído → 502 con mensaje claro', async () => {
    installFetchMock();
    originMode = 'down';
    const res = await worker.fetch(postRefresh('no-es-un-jwt'), env, {});
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.message).toContain('Origin no disponible');
  });

  it('refreshToken ausente → 400', async () => {
    installFetchMock();
    const res = await worker.fetch(postRefresh(null), env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('refreshToken requerido');
    expect(originCalls).toBe(0);
  });
});