/**
 * Amigos de visita en el hábitat (feature 021): estado reactivo de quién está ahora mismo
 * en tu pantalla + lógica pura compartida por FriendsTab / ClansTab / VisitTab / PetView.
 */
import { writable } from 'svelte/store';
import { isKnownSpecies } from '@pockai/scene/sprites';
import type { CoopFriend, HabitatSceneEvent, HabitatVisitor, PetIdentity, PresenceInfo } from './types';
import type { PetState } from '@pockai/scene/protocol';

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

/** `visualSeed` determinista por visitante: el sprite no cambia entre sesiones. Vive en el motor de sprites. */
export { visitorSeed } from '@pockai/scene/sprites/seed';

// ── Store: visitantes ahora mismo en tu hábitat ─────────────────────────────
export const visitorsStore = writable<HabitatVisitor[]>([]);

export function setVisitors(visitors: HabitatVisitor[]) {
  visitorsStore.set(visitors ?? []);
}
export function visitorJoined(visitor: HabitatVisitor) {
  visitorsStore.update((list) => upsertVisitor(list, visitor));
}
export function visitorLeft(visitorId: string) {
  visitScene.update((s) => (s?.visitorId === visitorId ? null : s));
  visitorsStore.update((list) => removeVisitor(list, visitorId));
}
export function clearVisitors() {
  visitorsStore.set([]);
}

// ── Visitante dentro de la sala (spec 37, anexo A, fase 4) ─────────────────
const STAGES = ['egg', 'baby', 'juvenile', 'adult', 'final'] as const;

/**
 * Aspecto del visitante para dibujarlo en la sala (`setGuest` de la escena). `null` si el
 * servidor no manda su aspecto (versión antigua): entonces no se dibuja dentro de la sala.
 */
export function guestPetState(visitor: HabitatVisitor | null | undefined): PetState | null {
  const pet = visitor?.pet;
  const look = pet?.look;
  if (!pet || !look) return null;
  const stage = STAGES.find((s) => s === pet.stage) ?? 'baby';
  return {
    species: resolveVisitorSpriteKey(pet),
    stage,
    palette: { primary: look.palette.primary, secondary: look.palette.secondary, ...(look.palette.accent ? { accent: look.palette.accent } : {}) },
    pattern: look.pattern,
    visualSeed: look.visualSeed,
    shiny: look.shiny,
    accessories: look.accessories,
  };
}

/** Cabe un visitante en la sala: el que llegó primero. Los demás siguen en la lista de visitas. */
export function roomGuestOf(visitors: HabitatVisitor[]): HabitatVisitor | null {
  return visitors.find((v) => !!v.pet?.look) ?? null;
}

const SCENE_LABEL: Record<string, string> = {
  greet: 'se están saludando',
  explore_together: 'curiosean juntos por la sala',
  play_tag: 'juegan al pilla-pilla',
  share_food: 'comparten la comida',
  nap_together: 'se echan una siesta juntos',
  squabble: 'se han picado',
  make_up: 'hacen las paces',
  give_gift: 'se hacen un regalo',
};

const STAGE_LABEL: Record<string, string> = {
  stranger: 'Acaban de conocerse',
  acquaintance: 'Ya se conocen',
  friend: 'Son amigos',
  best_friend: 'Son mejores amigos',
};

/** Qué están haciendo, en una frase («juegan al pilla-pilla»); vacío si la escena no se conoce. */
export function sceneLabel(type: string | null | undefined): string {
  return (type && SCENE_LABEL[type]) || '';
}

/** Cómo se llevan, en una frase («Son amigos»); vacío si la etapa no se conoce. */
export function stageLabel(stage: string | null | undefined): string {
  return (stage && STAGE_LABEL[stage]) || '';
}

/** Última escena recibida. `n` crece con cada una, para relanzarla aunque se repita el tipo. */
export const visitScene = writable<(HabitatSceneEvent & { n: number }) | null>(null);

let sceneCount = 0;
export function sceneReceived(ev: HabitatSceneEvent | null | undefined) {
  if (!ev?.visitorId || typeof ev.type !== 'string') return;
  visitScene.set({ ...ev, n: ++sceneCount });
}
