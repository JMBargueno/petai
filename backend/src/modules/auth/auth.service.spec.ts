import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

/**
 * Tests de emisión de tokens de `register`/`login` (S-01: fast-path eliminado).
 *
 * Verifica que se devuelven access y refresh JWT firmados con HS256 y que YA no se emite el
 * "refresh JWT fast-path" (RS256) del edge, que anulaba la revocación de tokens.
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

  const service = new AuthService(prismaMock as never, new JwtService(), configService, throttleMock as never, realtimeMock as never);
  return { service, prismaMock };
}

describe('AuthService — emisión de tokens (S-01: sin fast-path)', () => {
  it('register devuelve access y refresh HS256, sin fast-path', async () => {
    const { service } = buildService('user-1', 'jugador@petai.local', 'Astro');
    const res = await service.register({ email: 'jugador@petai.local', password: 'ContrasenaSegura123!' }, '127.0.0.1');

    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    // S-01: ya no se emite el refresh JWT fast-path (RS256) que verificaba el edge sin estado.
    expect('refreshFastPath' in res).toBe(false);

    expect(decodeHeader(res.accessToken).alg).toBe('HS256');
    const payload = decodePayload(res.refreshToken);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('jugador@petai.local');
    expect(payload.jti).toBeTruthy();
  });

  it('login también devuelve access y refresh HS256, sin fast-path', async () => {
    const userId = 'user-3';
    const { service, prismaMock } = buildService(userId, 'tres@petai.local', 'Sol');
    const passwordHash = await argon2.hash('ContrasenaSegura123!');
    prismaMock.user.findUnique.mockImplementation(async (q: any) =>
      q?.where?.email ? { id: userId, email: 'tres@petai.local', displayName: 'Sol', coins: 100, gems: 10, passwordHash } : null,
    );

    const res = await service.login({ email: 'tres@petai.local', password: 'ContrasenaSegura123!' }, '127.0.0.1');
    expect(decodeHeader(res.accessToken).alg).toBe('HS256');
    expect('refreshFastPath' in res).toBe(false);
    expect(decodePayload(res.refreshToken).sub).toBe(userId);
  });
});