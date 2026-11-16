/**
 * Chat y objetivos de clan (feature 021): estado reactivo que `App.svelte` escribe al recibir
 * eventos del socket (`clan:message`, `clan:goal_progress`, `clan:goal_completed`) y que
 * `ClansTab.svelte` suscribe para mostrarlo en vivo. Sigue el patrón de `lib/visitors.ts`.
 */
import { writable } from 'svelte/store';
import type { ClanGoal, ClanMessage } from './api';

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

/** Borra chat y objetivos (al salir del clan o cambiar de clan). */
export function clearClan() {
  clanMessagesStore.set([]);
  clanGoalsStore.set([]);
}
