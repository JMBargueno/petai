import { DEFAULT_ROLE, isRole, Role } from './roles';

/**
 * Catálogo de permisos (`recurso:acción`). Los endpoints declaran lo que necesitan con
 * `@RequirePermissions(...)`; cada rol recibe su lista en `ROLE_PERMISSIONS`.
 */
export const PERMISSIONS = [
  'admin:access', // entrar en el panel de administración
  'users:read',
  'users:update',
  'users:role:assign',
  'mods:moderate',
  'economy:manage',
  'events:manage',
  'audit:read',
  'invites:manage', // invitaciones de registro y ajuste "solo con invitación"
  'pets:read', // listar mascotas en el panel de administración
  'pets:rename', // renombrar mascotas desde el panel de administración
  'billing:manage', // precios, planes y límites de IA gestionada. SOLO superadmin.
  'users:verify', // marcar el correo como verificado / reenviar la verificación (soporte)
  'email:send', // enviar correos a usuarios desde el panel
  'site:manage', // ajustes de la web pública (landing «Coming soon», cuenta atrás)
  'vouchers:manage', // vouchers de recompensas y regalos directos (los días Pro exigen además billing:manage)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Comodín: concede cualquier permiso, incluidos los que se añadan en el futuro. */
export const ALL_PERMISSIONS = '*' as const;
type Grant = Permission | typeof ALL_PERMISSIONS;

/**
 * Permisos por rol. SuperAdmin lo puede todo. Admin gestiona el juego (economía, eventos, invitaciones)
 * y asigna roles por debajo del suyo (la regla de rango vive en `AdminUsersService.assignRole`).
 * Moderator solo consulta y modera.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Grant[]> = {
  superadmin: [ALL_PERMISSIONS],
  admin: [
    'admin:access',
    'users:read',
    'users:role:assign',
    'mods:moderate',
    'economy:manage',
    'events:manage',
    'audit:read',
    'pets:read',
    'pets:rename',
    'invites:manage',
    'users:verify',
    'email:send',
    'site:manage',
    'vouchers:manage',
  ],
  moderator: ['admin:access', 'users:read', 'mods:moderate', 'audit:read', 'pets:read'],
  user: [],
};

/** ¿El rol tiene el permiso? Un rol desconocido se trata como `user` (mínimo privilegio). */
export function hasPermission(role: unknown, permission: Permission): boolean {
  const grants = ROLE_PERMISSIONS[isRole(role) ? role : DEFAULT_ROLE];
  return grants.includes(ALL_PERMISSIONS) || grants.includes(permission);
}

/** Lista de permisos efectivos del rol (el comodín se expande), para que los clientes no dupliquen la tabla. */
export function permissionsFor(role: unknown): Permission[] {
  return PERMISSIONS.filter((p) => hasPermission(role, p));
}
