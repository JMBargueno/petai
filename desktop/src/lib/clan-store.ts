/**
 * Chat y objetivos de clan (feature 021): estado reactivo que `App.svelte` escribe al recibir
 * eventos del socket (`clan:message`, `clan:goal_progress`, `clan:goal_completed`) y que
 * `ClansTab.svelte` suscribe para mostrarlo en vivo. Sigue el patrón de `lib/visitors.ts`.
 */
import { writable } from 'svelte/store';
import type { ClanGoal, ClanMessage, ClanRole, ClanXpEvent } from './api';

// ── Rangos del Nexo (espejo de backend/src/modules/clans/clan-roles.ts) ─────
export const CLAN_ROLE_RANK: Record<ClanRole, number> = { creator: 4, admin: 3, moderator: 2, member: 1 };
export const CLAN_ROLE_LABEL: Record<ClanRole, string> = {
  creator: 'Forjador',
  admin: 'Guardián',
  moderator: 'Vigía',
  member: 'Hermano',
};

/** Normaliza un rango desconocido o heredado (`leader`) a uno válido. */
export function clanRole(role: string | null | undefined): ClanRole {
  if (role === 'leader') return 'creator';
  return role && role in CLAN_ROLE_RANK ? (role as ClanRole) : 'member';
}

const rank = (role: string | null | undefined) => CLAN_ROLE_RANK[clanRole(role)];

/** `true` si `role` alcanza al menos el rango `min`. */
export const hasClanRank = (role: string | null | undefined, min: ClanRole) => rank(role) >= CLAN_ROLE_RANK[min];

/** Qué puede hacer `me` sobre el miembro `target` (las mismas reglas que valida el backend). */
export function clanMemberActions(me: string | null | undefined, target: string | null | undefined) {
  const outranks = rank(me) > rank(target);
  const t = clanRole(target);
  return {
    kick: hasClanRank(me, 'moderator') && outranks,
    promote:
      hasClanRank(me, 'admin') && outranks && t !== 'admin' && CLAN_ROLE_RANK[nextUp(t)] < rank(me)
        ? nextUp(t)
        : null,
    demote: hasClanRank(me, 'admin') && outranks && t !== 'member' ? nextDown(t) : null,
    transfer: clanRole(me) === 'creator' && t !== 'creator',
  };
}

function nextUp(role: ClanRole): Exclude<ClanRole, 'creator'> {
  return role === 'member' ? 'moderator' : 'admin';
}
function nextDown(role: ClanRole): Exclude<ClanRole, 'creator'> {
  return role === 'admin' ? 'moderator' : 'member';
}

// ── Lógica pura (compartida y testeable) ───────────────────────────────────
/** Añade un mensaje al final del chat; ignora duplicados (el socket puede repetirlo). */
export function appendClanMessage(list: ClanMessage[], message: ClanMessage): ClanMessage[] {
  if (!message?.id) return list;
  if (list.some((m) => m.id === message.id)) return list;
  return [...list, message];
}

/** Añade o actualiza un objetivo por `id` (inmutable: el store reacciona). */
export function mergeClanGoal(list: ClanGoal[], goal: ClanGoal): ClanGoal[] {
  if (!goal?.id) return list;
  const i = list.findIndex((g) => g.id === goal.id);
  if (i === -1) return [...list, goal];
  const next = [...list];
  next[i] = goal;
  return next;
}

/** Quita un objetivo por `id`. */
export function removeClanGoal(list: ClanGoal[], goalId: string): ClanGoal[] {
  return list.filter((g) => g.id !== goalId);
}

/** Porcentaje de progreso de un objetivo, limitado a 0-100. */
export function goalPercent(goal: Pick<ClanGoal, 'progress' | 'target'>): number {
  if (!goal.target || goal.target <= 0) return 0;
  const pct = (goal.progress / goal.target) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// ── Stores: chat y objetivos del clan ──────────────────────────────────────
export const clanMessagesStore = writable<ClanMessage[]>([]);
export const clanGoalsStore = writable<ClanGoal[]>([]);

/** Añade un mensaje recibido por el socket al chat. */
export function pushClanMessage(message: ClanMessage) {
  clanMessagesStore.update((list) => appendClanMessage(list, message));
}

/** Sustituye todo el chat (p. ej. al cargar el historial inicial). */
export function setClanMessages(messages: ClanMessage[]) {
  clanMessagesStore.set(messages ?? []);
}

/** Añade o actualiza un objetivo (evento `clan:goal_progress` / `clan:goal_completed`). */
export function upsertClanGoal(goal: ClanGoal) {
  clanGoalsStore.update((list) => mergeClanGoal(list, goal));
}

/** Quita un objetivo localmente (tras borrarlo con éxito). */
export function dropClanGoal(goalId: string) {
  clanGoalsStore.update((list) => removeClanGoal(list, goalId));
}

/** Sustituye todos los objetivos (p. ej. al cargar con el clan). */
export function setClanGoals(goals: ClanGoal[]) {
  clanGoalsStore.set(goals ?? []);
}

/** Quita un mensaje del chat (evento `clan:message_deleted` o borrado propio). */
export function dropClanMessage(messageId: string) {
  clanMessagesStore.update((list) => list.filter((m) => m.id !== messageId));
}

/**
 * Se incrementa cuando cambia el roster por socket (`clan:role_changed`, `clan:member_kicked`,
 * `clan:disbanded`): `ClansTab` lo escucha y recarga el clan.
 */
export const clanRosterTick = writable(0);
export function bumpClanRoster() {
  clanRosterTick.update((n) => n + 1);
}

/**
 * Eventos en vivo para el hábitat del Nexo: XP ganada (`clan:xp`) y juramentos cumplidos
 * (`clan:goal_completed`). `n` crece en cada evento para que dos iguales seguidos también reaccionen.
 */
export type ClanHabitatEvent =
  | ({ kind: 'xp' } & ClanXpEvent & { n: number })
  | { kind: 'goal'; clanId: string; title: string; n: number };

export const clanHabitatEvents = writable<ClanHabitatEvent | null>(null);
let habitatEventN = 0;
export function emitClanHabitatEvent(ev: DistributiveOmit<ClanHabitatEvent, 'n'>) {
  clanHabitatEvents.set({ ...ev, n: ++habitatEventN } as ClanHabitatEvent);
}
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

/** Borra chat y objetivos (al salir del clan o cambiar de clan). */
export function clearClan() {
  clanMessagesStore.set([]);
  clanGoalsStore.set([]);
}
