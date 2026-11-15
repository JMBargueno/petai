/**
 * Roles de autorización (RBAC). Se guardan como String en `User.role` (convención del schema: sin
 * enums de Prisma); un CHECK en la migración `20261115020000_user_roles` impide valores fuera de esta lista.
 */
export const ROLES = ['superadmin', 'admin', 'moderator', 'user'] as const;
export type Role = (typeof ROLES)[number];

/** Rol que recibe toda cuenta nueva (también es el DEFAULT de la columna). */
export const DEFAULT_ROLE: Role = 'user';

/** Rango jerárquico: sirve para reglas del tipo "no puedes gestionar a alguien de rango ≥ al tuyo". */
export const ROLE_RANK: Record<Role, number> = {
  superadmin: 4,
  admin: 3,
  moderator: 2,
  user: 1,
};

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);
