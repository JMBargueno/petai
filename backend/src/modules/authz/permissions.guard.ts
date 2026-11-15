import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, Permission } from './permissions';
import { PERMISSIONS_KEY, ROLES_KEY } from './require-permissions.decorator';
import type { Role } from './roles';

/**
 * PermissionsGuard — comprueba `@RequirePermissions` / `@RequireRoles` contra `req.user.role`.
 * Debe ir DESPUÉS de `JwtAuthGuard` (que rellena `req.user` leyendo el rol de BD en cada petición,
 * así un cambio de rol aplica al instante). Sin metadata, deja pasar.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const permissions = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!permissions?.length && !roles?.length) return true;

    const role = context.switchToHttp().getRequest().user?.role;
    if (roles?.length && !roles.includes(role)) {
      throw new ForbiddenException('No tienes el rol necesario para esta acción');
    }
    const missing = (permissions ?? []).filter((p) => !hasPermission(role, p));
    if (missing.length) {
      throw new ForbiddenException(`Faltan permisos: ${missing.join(', ')}`);
    }
    return true;
  }
}
