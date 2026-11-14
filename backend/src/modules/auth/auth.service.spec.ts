import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { FastPathJwtService } from './fast-path-jwt';

/**
 * Tests del fast-path de refresh (feature 009-edge-cdn, T018).
 *
 * Verifica que `register`/`login` emiten el "refresh JWT fast-path" (RS256) con los claims
 * esperados: `sub`, `jti`, `iat`, `exp` y `typ: "refresh"`, y que se verifica contra el JWKS
 * público expuesto (coherencia origin ↔ edge).
 */

function decodeHeader(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}
function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function buildService(userId: string, email: string, displayName: string) {
  const user = {
    id: userId,
    email,
    displayName,
    coins: 100,
    gems: 10,
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(async (q: any) => (q?.where?.id ? user : null)),
      create: jest.fn(async () => user),
    },
    egg: { create: jest.fn(async () => ({ id: 'egg' })) },
    refreshToken: { create: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })), findFirst: jest.fn(async () => null), deleteMany: jest.fn(async () => ({})) },
  };

  const throttleMock = {
    limits: { registerPerIp: 10, registerWindowMs: 60000, loginFailsPerAccount: 10, loginWindowMs: 900000, loginFailsPerIp: 100, loginFailsPerAccountGlobal: 50, refreshPerIp: 60, refreshWindowMs: 60000 },
    consume: jest.fn(async () => undefined),
    assertBelow: jest.fn(async () => undefined),
    add: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  };

  const realtimeMock = { disconnectUser: jest.fn() };

  const configService = new ConfigService({
    JWT_ACCESS_SECRET: 'access-secret-minimum-16-characters',
    JWT_REFRESH_SECRET: 'refresh-secret-minimum-16-characters',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });

  const fastPath = new FastPathJwtService();
  fastPath.onModuleInit();

  const service = new AuthService(
    prismaMock as never,
    new JwtService(),
    configService,
    throttleMock as never,
    realtimeMock as never,
    fastPath,
  );
  return { service, prismaMock, fastPath, user };
}

describe('AuthService fast-path de refresh (T018)', () => {
  it('register emite el refresh JWT fast-path (RS256) con los claims esperados', async () => {
    const { service } = buildService('user-1', 'jugador@petai.local', 'Astro');
    const res = await service.register({ email: 'jugador@petai.local', password: 'ContrasenaSegura123!' }, '127.0.0.1');

    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(typeof res.refreshFastPath).toBe('string');

    const header = decodeHeader(res.refreshFastPath);
    expect(header.alg).toBe('RS256');

    const payload = decodePayload(res.refreshFastPath);
    expect(payload.sub).toBe('user-1');
    expect(payload.typ).toBe('refresh');
    expect(payload.jti).toBeTruthy();
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect((payload.exp as number) > (payload.iat as number)).toBe(true);
    expect(payload.email).toBe('jugador@petai.local');
    expect(payload.displayName).toBe('Astro');
  });

  it('el refresh fast-path se verifica contra el JWKS público del origin', async () => {
    const { service, fastPath } = buildService('user-2', 'otro@petai.local', 'Luna');
    const res = await service.register({ email: 'otro@petai.local', password: 'ContrasenaSegura123!' }, '127.0.0.1');

    const jwks = fastPath.buildJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].alg).toBe('RS256');
    expect(jwks.keys[0].use).toBe('sig');

    // Verificación del firma RS256 con la clave pública (mismo criterio que el edge).
    const [h, p, sig] = res.refreshFastPath.split('.');
    const publicKey = crypto.createPublicKey(fastPath.publicKeyPem);
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`, 'utf8'), publicKey, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('login también emite el refresh JWT fast-path', async () => {
    const userId = 'user-3';
    const { service, prismaMock } = buildService(userId, 'tres@petai.local', 'Sol');
    // La cuenta existe con un hash válido para la contraseña.
    const passwordHash = await argon2.hash('ContrasenaSegura123!');
    prismaMock.user.findUnique.mockImplementation(async (q: any) =>
      q?.where?.email ? { id: userId, email: 'tres@petai.local', displayName: 'Sol', coins: 100, gems: 10, passwordHash } : null,
    );

    const res = await service.login({ email: 'tres@petai.local', password: 'ContrasenaSegura123!' }, '127.0.0.1');
    expect(typeof res.refreshFastPath).toBe('string');
    const payload = decodePayload(res.refreshFastPath);
    expect(payload.typ).toBe('refresh');
    expect(payload.sub).toBe(userId);
  });
});