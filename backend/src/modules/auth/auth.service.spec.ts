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

function buildService(userId: string, email: string, displayName: string, opts: { inviteOnly?: boolean } = {}) {
  const user = {
    id: userId,
    email,
    displayName,
    coins: 100,
    gems: 10,
  };

  const prismaMock: any = {
    user: {
      findUnique: jest.fn(async (q: any) => (q?.where?.id ? user : null)),
      create: jest.fn(async () => user),
    },
    egg: { create: jest.fn(async () => ({ id: 'egg' })) },
    $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
    refreshToken: { create: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })), findFirst: jest.fn(async () => null), deleteMany: jest.fn(async () => ({})) },
  };

  const throttleMock = {
    limits: { registerPerIp: 10, registerWindowMs: 60000, loginFailsPerAccount: 10, loginWindowMs: 900000, loginFailsPerIp: 100, loginFailsPerAccountGlobal: 50, refreshPerIp: 60, refreshWindowMs: 60000, handleCheckPerIp: 60, handleCheckWindowMs: 60000 },
    consume: jest.fn(async () => undefined),
    assertBelow: jest.fn(async () => undefined),
    add: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  };

  const realtimeMock = { disconnectUser: jest.fn() };
  const invitesMock = {
    isInviteOnly: jest.fn(async () => opts.inviteOnly ?? false),
    redeem: jest.fn(async () => undefined),
  };

  const configService = new ConfigService({
    JWT_ACCESS_SECRET: 'access-secret-minimum-16-characters',
    JWT_REFRESH_SECRET: 'refresh-secret-minimum-16-characters',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });

  const service = new AuthService(prismaMock as never, new JwtService(), configService, throttleMock as never, realtimeMock as never, invitesMock as never);
  return { service, prismaMock, invitesMock };
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
describe('AuthService — registro con invitación', () => {
  const body = { email: 'nuevo@petai.local', password: 'ContrasenaSegura123!' };

  it('con el modo desactivado registra sin código y no canjea nada', async () => {
    const { service, invitesMock } = buildService('user-10', body.email, 'Nuevo');
    await expect(service.register(body, '127.0.0.1')).resolves.toHaveProperty('accessToken');
    expect(invitesMock.redeem).not.toHaveBeenCalled();
  });

  it('con el modo desactivado ignora un código enviado', async () => {
    const { service, invitesMock } = buildService('user-11', body.email, 'Nuevo');
    await service.register({ ...body, inviteCode: 'ABCD-EFGH' }, '127.0.0.1');
    expect(invitesMock.redeem).not.toHaveBeenCalled();
  });

  it('con el modo activo y sin código responde 403 y no crea el usuario', async () => {
    const { service, prismaMock } = buildService('user-12', body.email, 'Nuevo', { inviteOnly: true });
    await expect(service.register(body, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
    await expect(service.register({ ...body, inviteCode: '   ' }, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('con el modo activo y código canjea dentro de la transacción del registro', async () => {
    const { service, prismaMock, invitesMock } = buildService('user-13', body.email, 'Nuevo', { inviteOnly: true });
    await expect(service.register({ ...body, inviteCode: 'abcd-efgh' }, '127.0.0.1')).resolves.toHaveProperty('accessToken');
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(invitesMock.redeem).toHaveBeenCalledWith(prismaMock, 'abcd-efgh', 'user-13');
  });

  it('si el canje falla, el error se propaga (la transacción se deshace)', async () => {
    const { service, invitesMock, prismaMock } = buildService('user-14', body.email, 'Nuevo', { inviteOnly: true });
    const { ForbiddenException } = await import('@nestjs/common');
    invitesMock.redeem.mockRejectedValueOnce(new ForbiddenException('Código de invitación no válido o caducado') as never);
    await expect(service.register({ ...body, inviteCode: 'MALO-MALO' }, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
    expect(prismaMock.egg.create).not.toHaveBeenCalled();
  });
});

describe('AuthService — nickname en el registro', () => {
  const body = { email: 'nuevo@petai.local', password: 'ContrasenaSegura123!' };

  it('guarda el nickname normalizado (sin @ y en minúsculas)', async () => {
    const { service, prismaMock } = buildService('user-20', body.email, 'Nuevo');
    await service.register({ ...body, handle: '@JMBargueno' }, '127.0.0.1');
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ handle: 'jmbargueno' }) }),
    );
  });

  it('sin nickname (apps antiguas) crea la cuenta con handle null', async () => {
    const { service, prismaMock } = buildService('user-21', body.email, 'Nuevo');
    await service.register(body, '127.0.0.1');
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ handle: null }) }));
  });

  it('400 con un nickname reservado o mal formado', async () => {
    const { service } = buildService('user-22', body.email, 'Nuevo');
    await expect(service.register({ ...body, handle: 'admin' }, '127.0.0.1')).rejects.toMatchObject({ status: 400 });
    await expect(service.register({ ...body, handle: '1abc' }, '127.0.0.1')).rejects.toMatchObject({ status: 400 });
  });

  it('409 "nickname en uso" si ya existe o si la carrera choca con el índice único', async () => {
    const { service, prismaMock } = buildService('user-23', body.email, 'Nuevo');
    prismaMock.user.findUnique.mockImplementation(async (q: any) => (q?.where?.handle ? { id: 'otro' } : null));
    await expect(service.register({ ...body, handle: 'dada' }, '127.0.0.1')).rejects.toMatchObject({
      status: 409,
      message: 'Ese nickname ya está en uso',
    });

    prismaMock.user.findUnique.mockImplementation(async () => null);
    prismaMock.user.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['handle'] } });
    await expect(service.register({ ...body, handle: 'dada' }, '127.0.0.1')).rejects.toMatchObject({
      status: 409,
      message: 'Ese nickname ya está en uso',
    });

    prismaMock.user.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    await expect(service.register({ ...body, handle: 'dada' }, '127.0.0.1')).rejects.toMatchObject({
      status: 409,
      message: 'El correo electrónico ya está registrado',
    });
  });

  it('handleAvailability: libre, en uso o con el motivo del formato', async () => {
    const { service, prismaMock } = buildService('user-24', body.email, 'Nuevo');
    await expect(service.handleAvailability('@Libre', '1.1.1.1')).resolves.toEqual({ handle: 'libre', available: true });
    prismaMock.user.findUnique.mockImplementation(async () => ({ id: 'x' }));
    await expect(service.handleAvailability('ocupado', '1.1.1.1')).resolves.toMatchObject({ available: false, reason: 'Ese nickname ya está en uso' });
    await expect(service.handleAvailability('ab', '1.1.1.1')).resolves.toMatchObject({ available: false, reason: expect.stringContaining('al menos 3') });
  });
});
