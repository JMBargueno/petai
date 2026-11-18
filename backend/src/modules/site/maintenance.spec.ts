import { HttpException } from '@nestjs/common';
import { classifyClient, isMaintenanceAllowed, routePath, scopeIncludes } from './maintenance';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceGuard } from './maintenance.guard';

describe('mantenimiento: helpers', () => {
  it.each([
    ['web', undefined, 'web'],
    ['WEB', 'tauri://localhost', 'web'],
    ['desktop', 'https://pockai.world', 'apps'],
    ['android', undefined, 'apps'],
    [undefined, 'https://pockai.world', 'web'],
    [undefined, 'tauri://localhost', 'apps'],
    [undefined, 'https://tauri.localhost', 'apps'],
    [undefined, undefined, 'apps'],
  ])('X-Client %s + Origin %s → %s', (client, origin, kind) => {
    expect(classifyClient(client, origin)).toBe(kind);
  });

  it('el alcance decide a quién afecta', () => {
    expect(scopeIncludes('all', 'web')).toBe(true);
    expect(scopeIncludes('all', 'apps')).toBe(true);
    expect(scopeIncludes('web', 'apps')).toBe(false);
    expect(scopeIncludes('apps', 'web')).toBe(false);
    expect(scopeIncludes('web', 'web')).toBe(true);
  });

  it('quita el prefijo global', () => {
    expect(routePath('/v1/site/config', 'v1')).toBe('site/config');
    expect(routePath('/v1/site/config/', '/v1/')).toBe('site/config');
    expect(routePath('/api/me', 'api')).toBe('me');
    expect(routePath('/v1', 'v1')).toBe('');
  });

  it.each([
    ['health', true],
    ['health/ready', true],
    ['site/config', true],
    ['contact', true],
    ['auth/login', true],
    ['auth/refresh', true],
    ['auth/logout', true],
    ['me', true],
    ['admin', true],
    ['admin/site-settings', true],
    ['billing/stripe/webhook', true],
    ['auth/register', false],
    ['pets', false],
    ['me/settings', false],
    ['billing/stripe/checkout', false],
    ['administrator', false],
  ])('ruta %s abierta: %s', (path, allowed) => {
    expect(isMaintenanceAllowed(path)).toBe(allowed);
  });
});

describe('MaintenanceService / MaintenanceGuard', () => {
  function build(opts: { enabled?: boolean; scope?: 'web' | 'apps' | 'all'; role?: string | null; es?: string | null } = {}) {
    const settings = {
      getMaintenance: jest.fn(async () => ({
        enabled: opts.enabled ?? true,
        scope: opts.scope ?? 'all',
        message: { es: opts.es ?? null, en: null },
      })),
    };
    const jwt = {
      verify: jest.fn((token: string) => {
        if (token === 'valido') return { sub: 'u1' };
        throw new Error('firma');
      }),
    };
    const config = { get: jest.fn((key: string) => (key === 'API_PREFIX' ? 'v1' : 'secreto')) };
    const prisma = {
      user: { findUnique: jest.fn(async () => (opts.role === null ? null : { role: opts.role ?? 'user' })) },
    };
    const service = new MaintenanceService(settings as never, jwt as never, config as never, prisma as never);
    const guard = new MaintenanceGuard(service, config as never);
    return { service, guard, prisma };
  }

  function ctx(path: string, headers: Record<string, string> = {}, method = 'GET') {
    const setHeader = jest.fn();
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ path, method, headers }),
        getResponse: () => ({ setHeader }),
      }),
    };
    return { context: context as never, setHeader };
  }

  it('desactivado: no bloquea nada', async () => {
    const { service } = build({ enabled: false });
    expect(await service.check({ client: 'web' })).toBeNull();
  });

  it('bloquea según el alcance y el tipo de cliente', async () => {
    expect(await build({ scope: 'web' }).service.check({ client: 'web' })).not.toBeNull();
    expect(await build({ scope: 'web' }).service.check({ client: 'desktop' })).toBeNull();
    expect(await build({ scope: 'apps' }).service.check({ client: 'android' })).not.toBeNull();
    expect(await build({ scope: 'apps' }).service.check({ origin: 'https://pockai.world' })).toBeNull();
    expect(await build({ scope: 'all' }).service.check({})).not.toBeNull();
  });

  it('el cuerpo lleva el código y el mensaje en los dos idiomas (con texto por defecto)', async () => {
    const body = await build({ es: 'Volvemos a las 18:00' }).service.check({ client: 'web' });
    expect(body).toEqual({
      statusCode: 503,
      code: 'MAINTENANCE',
      message: 'Volvemos a las 18:00',
      messages: { es: 'Volvemos a las 18:00', en: expect.stringContaining('maintenance') },
    });
  });

  it('los admins y moderadores pasan; usuarios, tokens inválidos y cuentas borradas no', async () => {
    expect(await build({ role: 'admin' }).service.check({ authorization: 'Bearer valido' })).toBeNull();
    expect(await build({ role: 'moderator' }).service.check({ authorization: 'Bearer valido' })).toBeNull();
    expect(await build({ role: 'superadmin' }).service.check({ authorization: 'valido' })).toBeNull();
    expect(await build({ role: 'user' }).service.check({ authorization: 'Bearer valido' })).not.toBeNull();
    expect(await build({ role: 'admin' }).service.check({ authorization: 'Bearer falso' })).not.toBeNull();
    expect(await build({ role: null }).service.check({ authorization: 'Bearer valido' })).not.toBeNull();
  });

  it('recuerda el rol un rato para no consultar la base de datos en cada petición', async () => {
    const { service, prisma } = build({ role: 'admin' });
    await service.check({ authorization: 'Bearer valido' });
    await service.check({ authorization: 'Bearer valido' });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('el guard deja pasar las rutas abiertas y el preflight, y responde 503 con Retry-After al resto', async () => {
    const { guard } = build();
    expect(await guard.canActivate(ctx('/v1/contact').context)).toBe(true);
    expect(await guard.canActivate(ctx('/v1/admin/stats').context)).toBe(true);
    expect(await guard.canActivate(ctx('/v1/pets', {}, 'OPTIONS').context)).toBe(true);

    const { context, setHeader } = ctx('/v1/pets', { 'x-client': 'web' });
    const err = await guard.canActivate(context).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect(((err as HttpException).getResponse() as { code: string }).code).toBe('MAINTENANCE');
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });
});
