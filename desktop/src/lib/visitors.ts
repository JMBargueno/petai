/**
 * Amigos de visita en el hábitat (feature 021): estado reactivo de quién está ahora mismo
 * en tu pantalla + lógica pura compartida por FriendsTab / ClansTab / VisitTab / PetView.
 */
import { writable } from 'svelte/store';
import { isKnownSpecies } from './sprites';
import type { CoopFriend, HabitatVisitor, PetIdentity, PresenceInfo } from './api';

// ── Presencia (punto verde/gris en las listas de amigos y clanes) ───────────
export type PresenceState = 'online' | 'offline' | 'unknown';

/** Punto de presencia de un jugador: `online` si tiene algún dispositivo activo. */
export function presenceState(p: PresenceInfo | null | undefined): PresenceState {
  if (!p) return 'unknown';
  return p.hasActiveDevices ? 'online' : 'offline';
}

// ── Amistad: filtrado de la lista de cooperaciones ─────────────────────────
/** Amigos con la petición aceptada (los únicos que se pueden visitar). */
export function acceptedFriends(friends: CoopFriend[] | null | undefined): CoopFriend[] {
  return (friends ?? []).filter((f) => f.status === 'accepted');
}

/** Solicitudes en espera (pendientes de aceptar/rechazar o aún sin respuesta). */
export function pendingFriends(friends: CoopFriend[] | null | undefined): CoopFriend[] {
  return (friends ?? []).filter((f) => f.status === 'pending');
}

/** Nombre de mascota de un amigo para mostrar (con fallback a la especie). */
export function friendPetLabel(f: CoopFriend): string {
  const pet = f.otherPet;
  if (!pet) return 'Sin mascota';
  return pet.nickname ? `${pet.nickname} (${pet.speciesName})` : pet.speciesName;
}

// ── Visitantes del hábitat ─────────────────────────────────────────────────
/** Añade o actualiza un visitante por `visitorId` (inmutable: el store reacciona). */
export function upsertVisitor(list: HabitatVisitor[], visitor: HabitatVisitor): HabitatVisitor[] {
  const i = list.findIndex((v) => v.visitorId === visitor.visitorId);
  if (i === -1) return [...list, visitor];
  const next = [...list];
  next[i] = visitor;
  return next;
}

/** Quita un visitante (al salirse de tu hábitat). */
export function removeVisitor(list: HabitatVisitor[], visitorId: string): HabitatVisitor[] {
  return list.filter((v) => v.visitorId !== visitorId);
}

/**
 * Clave de especie para dibujar la mascota de un visitante, usando la misma biblioteca de
 * sprites que la propia mascota: `speciesId` si el cliente la conoce, luego `spriteRef`
 * (si coincide con una especie local), y si no resuelve, fallback a la especie por defecto.
 */
export function resolveVisitorSpriteKey(pet: PetIdentity | null | undefined): string {
  const DEFAULT = 'ignisaur';
  if (!pet) return DEFAULT;
  if (pet.speciesId && isKnownSpecies(pet.speciesId)) return pet.speciesId;
  if (pet.spriteRef && isKnownSpecies(pet.spriteRef)) return pet.spriteRef;
  return DEFAULT;
}

/** `visualSeed` determinista por visitante: el sprite no cambia entre sesiones. */
export function visitorSeed(visitorId: string): number {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < visitorId.length; i++) {
    h ^= visitorId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 99991 || 1337;
}

// ── Store: visitantes ahora mismo en tu hábitat ─────────────────────────────
export const visitorsStore = writable<HabitatVisitor[]>([]);

export function setVisitors(visitors: HabitatVisitor[]) {
  visitorsStore.set(visitors ?? []);
}
export function visitorJoined(visitor: HabitatVisitor) {
  visitorsStore.update((list) => upsertVisitor(list, visitor));
}
export function visitorLeft(visitorId: string) {
  visitorsStore.update((list) => removeVisitor(list, visitorId));
}
export function clearVisitors() {
  visitorsStore.set([]);
}
