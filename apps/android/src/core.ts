/**
 * El núcleo visto desde la UI de Android.
 *
 * Aquí no hay lógica de juego ni llamadas al backend: el estado se refleja desde el núcleo (Rust) y
 * lo que el jugador hace se le pide con una acción tipada. Es el mismo núcleo que usa el escritorio.
 */
import { get, writable } from 'svelte/store';
import {
  hasCore,
  logout as coreLogout,
  onSession,
  onStateChange,
  perform,
  sessionState,
  stateLoad,
  stateSnapshot,
  type Action,
  type ActionError,
  type AppState,
} from '@pockai/client';

export type Phase = 'starting' | 'signedOut' | 'ready' | 'locked';

const EMPTY: AppState = { rev: 0, user: null, pets: [], activePetId: null, eggs: [], inventory: [], shop: [], inbox: [], environment: null };

export const phase = writable<Phase>('starting');
export const state = writable<AppState>(EMPTY);
/** El último estado se cargó del disco porque no hay conexión. */
export const offline = writable(false);

export { hasCore };

/** La mascota activa: la elegida si sigue existiendo; si no, la primera. */
export function activePet(s: AppState) {
  return s.pets.find((p) => p.id === s.activePetId) ?? s.pets[0] ?? null;
}

let started = false;

/** Empieza a reflejar el núcleo. Con estado guardado, la app pinta antes de hablar con la red. */
export async function start(): Promise<void> {
  if (started) return;
  started = true;
  await onStateChange((change) => state.update((s) => (change.rev > s.rev ? { ...s, rev: change.rev, [sliceKey(change.slice)]: change.value } : s)));
  await onSession((kind) => {
    if (kind === 'loggedOut' || kind === 'expired') phase.set('signedOut');
    else if (kind === 'unverified' || kind === 'handleRequired') phase.set('locked');
  });
  state.set(await stateSnapshot());
  if ((await sessionState()).active) await load();
  else phase.set('signedOut');
}

/** El nombre de cada parte del estado es el de su campo. */
function sliceKey(slice: string): keyof AppState {
  return slice as keyof AppState;
}

async function load(): Promise<void> {
  const outcome = await stateLoad({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null });
  state.set(await stateSnapshot());
  offline.set(outcome.offline);
  if (!outcome.session) phase.set('signedOut');
  else if (outcome.lock) phase.set('locked');
  else phase.set(get(state).user ? 'ready' : 'signedOut');
}

/** Lo que se le enseña al jugador cuando algo falla. */
export function failureText(e: unknown, fallback: string): string {
  const failure = (e ?? {}) as Partial<ActionError>;
  if (failure.status == null && !failure.message) return 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.';
  return failure.message || fallback;
}

export async function signIn(email: string, password: string): Promise<void> {
  await perform({ type: 'login', email, password });
  await load();
}

export async function signOut(): Promise<void> {
  await coreLogout();
  phase.set('signedOut');
}

/** Una acción del jugador. El estado se actualiza solo: el núcleo lo deja al día. */
export function act(action: Action): Promise<unknown> {
  return perform(action);
}
