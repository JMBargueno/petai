/**
 * Estado global de la app: usuario, mascotas, huevos, inventario y tienda.
 *
 * Dentro de la app el dueño es el núcleo en Rust (`crates/pockai-core/src/state.rs`): él lo carga,
 * lo sondea, lo actualiza con el tiempo real y lo guarda en disco. Aquí solo se refleja en stores y
 * se le entregan los cambios que origina la UI. En el navegador (modo demo) y en los tests no hay
 * núcleo y este módulo hace ese trabajo con `api.ts`, como antes hacía `App.svelte`.
 */
import { derived, get, writable } from 'svelte/store';
import {
  hasCore,
  inboxPush,
  onStateChange,
  stateApplyPet,
  stateLoad,
  statePatchPet,
  stateRefresh,
  stateSelectPet,
  stateSnapshot,
  type AppState,
  type StateChange,
} from '@pockai/client';
import { api, getAccessToken, sessionReady } from './api';
import { loadActivePetId, pickActivePet, saveActivePetId } from './activePet';
import { setInboxFromCore, takeLegacyInbox, type InboxNotification } from './notification-inbox';

/** Paso de alta que le falta a la cuenta. */
export type AccountLock = 'unverified' | 'noHandle';

export interface LoadResult {
  /** Hay sesión. */
  session: boolean;
  /** A la cuenta le falta verificar el correo o elegir nickname: solo se muestra esa pantalla. */
  lock: AccountLock | null;
  /** No se pudo hablar con el servidor. */
  offline: boolean;
}

export const user = writable<any>(null);
export const pets = writable<any[]>([]);
/** La mascota que el jugador eligió en este equipo (sin elección, la activa es la primera). */
export const activePetId = writable<string | null>(null);
export const eggs = writable<any[]>([]);
export const inventory = writable<any[]>([]);
export const shopItems = writable<any[]>([]);
/**
 * Estado ambiental que da el servidor (hora del día, actividad, festividad). Solo lo rellena el
 * núcleo; sin él lo sigue llevando `App.svelte` con `lib/environmental`.
 */
export const environment = writable<any>(null);

/** La mascota activa: la que pasea por el escritorio y a la que se refieren todas las pestañas. */
export const currentPet = derived([pets, activePetId], ([$pets, $id]) => pickActivePet($pets, $id));

const serverPetsListeners = new Set<() => void>();

/**
 * Avisa cada vez que llega del servidor una lectura fresca de las mascotas (sondeo o tiempo real):
 * es el momento de revisar si la activa necesita atención.
 */
export function onServerPets(cb: () => void): () => void {
  serverPetsListeners.add(cb);
  return () => serverPetsListeners.delete(cb);
}

function serverPetsArrived() {
  serverPetsListeners.forEach((cb) => cb());
}

function upsertPet(pet: any, add: boolean) {
  if (!pet?.id) return;
  pets.update((list) => {
    const index = list.findIndex((p) => p.id === pet.id);
    if (index === -1) return add ? [...list, pet] : list;
    const next = [...list];
    next[index] = pet;
    return next;
  });
}

// ── Reflejo del núcleo ───────────────────────────────────────────────────────────────────────

let coreReady: Promise<void> | null = null;
/** Última revisión del estado del núcleo ya reflejada: descarta lo que llegue desordenado. */
let lastRev = -1;

function applySnapshot(state: AppState) {
  if (state.rev < lastRev) return;
  lastRev = state.rev;
  user.set(state.user);
  pets.set(state.pets);
  activePetId.set(state.activePetId);
  eggs.set(state.eggs);
  inventory.set(state.inventory);
  shopItems.set(state.shop);
  setInboxFromCore(state.inbox as unknown as InboxNotification[]);
  environment.set(state.environment);
}

function applyChange(change: StateChange) {
  if (change.rev <= lastRev) return;
  lastRev = change.rev;
  const value = change.value as any;
  if (change.slice === 'user') user.set(value);
  else if (change.slice === 'pets') pets.set(value);
  else if (change.slice === 'activePetId') activePetId.set(value);
  else if (change.slice === 'eggs') eggs.set(value);
  else if (change.slice === 'inventory') inventory.set(value);
  else if (change.slice === 'shop') shopItems.set(value);
  else if (change.slice === 'inbox') setInboxFromCore(value);
  else if (change.slice === 'environment') environment.set(value);
  if (change.slice === 'pets' && change.source === 'server') serverPetsArrived();
}

/** Empieza a reflejar el estado del núcleo. Con el estado guardado, la app pinta antes de la red. */
function connectCore(): Promise<void> {
  return (coreReady ??= (async () => {
    await onStateChange(applyChange);
    applySnapshot(await stateSnapshot());
    // La bandeja que guardaba el webview pasa al núcleo (del aviso más antiguo al más reciente).
    for (const notice of takeLegacyInbox().reverse()) await inboxPush(notice).catch(() => {});
  })());
}

// ── Carga ────────────────────────────────────────────────────────────────────────────────────

/** Carga el estado inicial. Se llama al arrancar y tras iniciar sesión. */
export async function load(): Promise<LoadResult> {
  return hasCore() ? loadFromCore() : loadFromApi();
}

async function loadFromCore(): Promise<LoadResult> {
  await connectCore();
  await sessionReady();
  const legacy = loadActivePetId();
  const outcome = await stateLoad({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    legacyActivePetId: legacy,
  });
  applySnapshot(await stateSnapshot());
  // La elección de mascota activa ya la guarda el núcleo: se retira la copia del webview.
  if (legacy && outcome.session && !outcome.lock && !outcome.offline) saveActivePetId(null);
  return { session: outcome.session, lock: outcome.lock, offline: outcome.offline };
}

async function loadFromApi(): Promise<LoadResult> {
  try {
    const catalog = await api.getCatalog();
    // Spec 41: lo que es solo drop (cofres y actividades) u oculto (solo admin) no se vende
    shopItems.set(((catalog as any).foods || []).filter((f: any) => (f.availability ?? 'shop') === 'shop'));

    if (!getAccessToken()) return { session: false, lock: null, offline: false };
    let me: any = await api.getMe();
    user.set(me);
    if (me?.emailVerified === false) return { session: true, lock: 'unverified', offline: false };
    if (me && me.handle === null) return { session: true, lock: 'noHandle', offline: false };

    // El servidor usa la zona horaria del usuario (ciclo de sueño, recordatorios):
    // si sigue en el valor por defecto (UTC), se ajusta a la del equipo.
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (me.timezone === 'UTC' && localTz && localTz !== 'UTC') {
      try {
        me = await api.updateMe({ timezone: localTz });
        user.set(me);
      } catch {
        /* no crítico: se reintenta en el próximo inicio */
      }
    }
    pets.set((await api.getPets()) as any[]);
    activePetId.set(loadActivePetId());
    eggs.set((await api.getEggs()) as any[]);
    inventory.set((await api.getInventory()) as any[]);
    syncActivePet();
    return { session: true, lock: null, offline: false };
  } catch (err) {
    // Si la sesión ya no es válida, la capa de API la cierra (onSessionExpired). Un fallo de
    // red no borra los tokens: se podrá entrar sin credenciales en el próximo arranque.
    console.warn('Sesión no iniciada o servidor no disponible:', err);
    user.set(null);
    return { session: false, lock: null, offline: true };
  }
}

// ── Refrescos ────────────────────────────────────────────────────────────────────────────────

async function refresh(slice: 'user' | 'pets' | 'eggs', fromApi: () => Promise<void>) {
  try {
    if (hasCore()) await stateRefresh(slice);
    else await fromApi();
  } catch {
    /* sin conexión: se actualizará con el siguiente ciclo */
  }
}

export function refreshUser(): Promise<void> {
  return refresh('user', async () => user.set(await api.getMe()));
}

export function refreshEggs(): Promise<void> {
  return refresh('eggs', async () => eggs.set((await api.getEggs()) as any[]));
}

export function refreshPets(): Promise<void> {
  return refresh('pets', async () => pets.set((await api.getPets()) as any[]));
}

/**
 * Sondeo periódico de las mascotas (las constantes vitales solo se recalculan al consultarlas).
 * Con núcleo lo lleva él; sin él se hace aquí.
 */
export async function poll(): Promise<void> {
  if (hasCore() || !getAccessToken() || !get(currentPet)) return;
  try {
    pets.set((await api.getPets()) as any[]);
    serverPetsArrived();
  } catch {
    /* sin conexión o sesión caducada: se reintenta en el siguiente ciclo */
  }
}

// ── Cambios que origina la UI ────────────────────────────────────────────────────────────────

/** Una mascota que la UI acaba de recibir del servidor (dar de comer, bañar, eclosionar…). */
export function applyPet(pet: any, add = true) {
  if (!pet?.id) return;
  upsertPet(pet, add);
  if (hasCore()) void stateApplyPet(pet, add).catch(() => {});
}

/** Cambia campos sueltos de la mascota activa sin esperar al servidor. */
export function patchActivePet(patch: Record<string, unknown>) {
  const pet = get(currentPet) as any;
  if (!pet) return;
  upsertPet({ ...pet, ...patch }, false);
  if (hasCore()) void statePatchPet(pet.id, patch).catch(() => {});
}

/** Cambia la mascota activa y lo recuerda en este equipo. Devuelve si cambió. */
export function selectPet(id: string): boolean {
  // Elegir la que ya se ve por defecto también cuenta: deja de depender del orden de la lista.
  if (id === get(activePetId) || !get(pets).some((p) => p.id === id)) return false;
  activePetId.set(id);
  if (hasCore()) void stateSelectPet(id).catch(() => {});
  else {
    saveActivePetId(id);
    syncActivePet();
  }
  return true;
}

/** `pet:update` del tiempo real. Con núcleo ya lo aplica él y llega por su evento de estado. */
export function applyRealtimePet(pet: any) {
  if (hasCore()) return;
  upsertPet(pet, false);
  serverPetsArrived();
}

/** El saldo ha cambiado en el servidor (logro, recompensa). Con núcleo lo refresca él. */
export function userChangedOnServer() {
  if (!hasCore()) void refreshUser();
}

/** Vacía el estado de la sesión (la tienda, que es pública, se conserva). */
export function clear() {
  syncedActivePetId = null;
  user.set(null);
  pets.set([]);
  eggs.set([]);
  inventory.set([]);
}

/** Deja solo al usuario, marcado con el paso de alta que le falta. */
export function lock(kind: AccountLock, current: any) {
  if (!current) return;
  user.set(kind === 'unverified' ? { ...current, emailVerified: false } : { ...current, handle: null });
}

// ── Mascota activa en el servidor (solo sin núcleo) ──────────────────────────────────────────

let syncedActivePetId: string | null = null;

/**
 * El servidor también guarda cuál es la mascota activa (la que te representa en el hábitat del
 * clan y en las visitas). Solo si es una elección guardada en este equipo: uno recién instalado
 * (sin elección) mostraría la primera mascota y pisaría la que el jugador eligió en otro.
 */
function syncActivePet() {
  const id = (get(currentPet) as any)?.id;
  if (!get(user) || !id || id === syncedActivePetId || id !== loadActivePetId()) return;
  syncedActivePetId = id;
  api.activatePet(id).catch(() => {
    if (syncedActivePetId === id) syncedActivePetId = null; // se reintenta en el próximo cambio
  });
}

/** Solo para tests. */
export function resetAppState() {
  coreReady = null;
  lastRev = -1;
  syncedActivePetId = null;
  serverPetsListeners.clear();
  clear();
  activePetId.set(null);
  shopItems.set([]);
}
