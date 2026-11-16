import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ALLOW_UNVERIFIED_KEY } from './allow-unverified.decorator';

describe('JwtAuthGuard (verificación de correo)', () => {
  const parentCanActivate = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');

  const context = (user: unknown, allow = false) => {
    const handler = () => undefined;
    if (allow) Reflect.defineMetadata(ALLOW_UNVERIFIED_KEY, true, handler);
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => class {},
    } as any;
  };
  const guard = (required: boolean) =>
    new JwtAuthGuard(new Reflector(), { get: (k: string) => (k === 'EMAIL_VERIFICATION_REQUIRED' ? String(required) : undefined) } as any);

  beforeEach(() => parentCanActivate.mockResolvedValue(true));
  afterAll(() => parentCanActivate.mockRestore());

  it('con el flag desactivado deja pasar a cuentas sin verificar', async () => {
    await expect(guard(false).canActivate(context({ emailVerifiedAt: null }))).resolves.toBe(true);
  });

  it('con el flag activo bloquea con 403 EMAIL_NOT_VERIFIED', async () => {
    const err = await guard(true).canActivate(context({ emailVerifiedAt: null })).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED' });
  });

  it('deja pasar a cuentas verificadas', async () => {
    await expect(guard(true).canActivate(context({ emailVerifiedAt: new Date() }))).resolves.toBe(true);
  });

  it('respeta @AllowUnverified', async () => {
    await expect(guard(true).canActivate(context({ emailVerifiedAt: null }, true))).resolves.toBe(true);
  });

  it('si la autenticación falla no llega a comprobar la verificación', async () => {
    parentCanActivate.mockResolvedValue(false);
    await expect(guard(true).canActivate(context(undefined))).resolves.toBe(false);
  });
});
