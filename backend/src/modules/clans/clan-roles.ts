/**
 * Rangos dentro de un clan (lore: "Nexo de Resonancia", ver docs/LORE.md §8). Se guardan como String
 * en `ClanMembership.role`; un CHECK en la migración `20261116020000_clan_roles` impide otros valores.
 *
 * Son independientes de los roles globales de autorización (`authz/roles.ts`).
 *
 *   creator   → Forjador del Nexo (uno por clan; `Clan.leaderId` apunta a él)
 *   admin     → Guardián
 *   moderator → Vigía
 *   member    → Hermano / Hermana
 */
export const CLAN_ROLES = ['creator', 'admin', 'moderator', 'member'] as const;
export type ClanRole = (typeof CLAN_ROLES)[number];

/** Roles que se pueden asignar con "cambiar rol" (el de Forjador solo se cede con la transferencia). */
export const ASSIGNABLE_CLAN_ROLES = ['admin', 'moderator', 'member'] as const satisfies readonly ClanRole[];

export const CLAN_ROLE_RANK: Record<ClanRole, number> = {
  creator: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

export const CLAN_ROLE_LABEL: Record<ClanRole, string> = {
  creator: 'Forjador del Nexo',
  admin: 'Guardián',
  moderator: 'Vigía',
  member: 'Hermano',
};

export const isClanRole = (value: unknown): value is ClanRole =>
  typeof value === 'string' && (CLAN_ROLES as readonly string[]).includes(value);

/** Normaliza valores heredados (`leader` antes de los rangos) y desconocidos. */
export function normalizeClanRole(value: unknown): ClanRole {
  if (value === 'leader') return 'creator';
  return isClanRole(value) ? value : 'member';
}

/** `true` si `role` alcanza al menos el rango `min`. */
export const hasClanRank = (role: unknown, min: ClanRole): boolean =>
  CLAN_ROLE_RANK[normalizeClanRole(role)] >= CLAN_ROLE_RANK[min];

/** `true` si `actor` tiene un rango estrictamente superior a `target`. */
export const outranks = (actor: unknown, target: unknown): boolean =>
  CLAN_ROLE_RANK[normalizeClanRole(actor)] > CLAN_ROLE_RANK[normalizeClanRole(target)];
