import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, ROLES_KEY } from './require-permissions.decorator';

function ctx(user: unknown, meta: Record<string, unknown>): { context: ExecutionContext; reflector: Reflector } {
  const reflector = { getAllAndOverride: jest.fn((key: string) => meta[key]) } as unknown as Reflector;
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe('PermissionsGuard', () => {
  it('sin metadata deja pasar', () => {
    const { context, reflector } = ctx({ role: 'user' }, {});
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('rechaza a un user sin el permiso', () => {
    const { context, reflector } = ctx({ role: 'user' }, { [PERMISSIONS_KEY]: ['users:read'] });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });

  it('permite a superadmin cualquier permiso', () => {
    const { context, reflector } = ctx({ role: 'superadmin' }, { [PERMISSIONS_KEY]: ['users:read', 'users:role:assign'] });
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('aplica @RequireRoles', () => {
    const meta = { [ROLES_KEY]: ['moderator'] };
    expect(() => new PermissionsGuard(ctx({ role: 'user' }, meta).reflector).canActivate(ctx({ role: 'user' }, meta).context)).toThrow(ForbiddenException);
    const ok = ctx({ role: 'moderator' }, meta);
    expect(new PermissionsGuard(ok.reflector).canActivate(ok.context)).toBe(true);
  });

  it('sin usuario autenticado rechaza', () => {
    const { context, reflector } = ctx(undefined, { [PERMISSIONS_KEY]: ['users:read'] });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });
});
