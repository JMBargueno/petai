import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions';
import type { Role } from './roles';

export const PERMISSIONS_KEY = 'authz:permissions';
export const ROLES_KEY = 'authz:roles';

/** Exige TODOS los permisos indicados. Usar junto a `@UseGuards(JwtAuthGuard, PermissionsGuard)`. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Exige que el usuario tenga ALGUNO de los roles indicados (preferir permisos salvo casos puntuales). */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
