/**
 * El núcleo visto desde la UI de Android.
 *
 * Aquí no hay lógica de juego ni llamadas al backend: el estado se refleja desde el núcleo (Rust) y
 * lo que el jugador hace se le pide con una acción tipada. Es el mismo núcleo que usa el escritorio.
 */
import { get, writable } from 'svelte/store';
import { celebrateReward, type AuthApi, type HandleCheck, type RewardReceived } from '@pockai/ui';
import { clearClan, clearVisitors, connectSocialFeed } from '@pockai/ui/social';
import {
  hasCore,
  logout as coreLogout,
  onRealtime,
  onSession,
  onStateChange,
  perform,
  query,
  sessionState,
  stateLoad,
  stateRefresh,
  stateSnapshot,
  type Action,
  type AccountLock,
  type ActionError,
  type AppState,
} from '@pockai/client';

export type Phase = 'starting' | 'signedOut' | 'ready' | 'locked';

const EMPTY: AppState = { rev: 0, user: null, pets: [], activePetId: null, eggs: [], inventory: [], shop: [], inbox: [], environment: null };

export const phase = writable<Phase>('starting');
/** Con `phase` en `locked`: qué paso de alta le falta a la cuenta. */
export const lock = writable<AccountLock | null>(null);
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
  await connectRealtimeFeeds();
  await onSession((kind) => {
    if (kind === 'loggedOut' || kind === 'expired') phase.set('signedOut');
    else if (kind === 'unverified' || kind === 'handleRequired') {
      lock.set(kind === 'unverified' ? 'unverified' : 'noHandle');
      phase.set('locked');
    }
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
  lock.set(outcome.lock);
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

/**
 * Las llamadas de las pantallas de acceso de `@pockai/ui` (entrar, alta, verificar el correo,
 * nickname, recuperar la contraseña), todas por el núcleo. Cuando una abre sesión o completa un paso
 * de alta, la pantalla avisa y se llama a `reload`, que vuelve a cargar el estado y decide la fase.
 */
export const authApi: AuthApi = {
  login: (email, password) => perform({ type: 'login', email, password }),
  register: ({ email, password, handle, displayName, inviteCode }) =>
    perform({ type: 'register', email, password, handle, displayName: displayName ?? null, inviteCode: inviteCode ?? null }),
  registrationConfig: () => query<{ inviteRequired: boolean }>({ type: 'registrationConfig' }),
  requestPasswordReset: (email) => perform({ type: 'requestPasswordReset', email }),
  confirmPasswordReset: (email, code, newPassword) => perform({ type: 'confirmPasswordReset', email, code, newPassword }),
  checkHandle: (handle) =>
    query<HandleCheck>({ type: 'handleAvailable', handle }).catch((e) => ({ handle, available: false, reason: failureText(e, 'No se pudo comprobar') })),
  verifyEmail: (code) => perform({ type: 'verifyEmail', code }),
  resendVerification: () => perform({ type: 'resendVerification' }),
  isEmailVerified: async () => Boolean((await query<{ emailVerified?: boolean } | null>({ type: 'me' }))?.emailVerified),
  setHandle: (handle) => perform({ type: 'setHandle', handle }),
  errorText: failureText,
};

/** Tras entrar o completar un paso de alta: se recarga el estado y con él la fase. */
export const reload = () => load();

export async function signOut(): Promise<void> {
  await coreLogout();
  clearVisitors();
  clearClan();
  phase.set('signedOut');
}

/**
 * Los eventos de tiempo real que el núcleo reenvía (`onRealtime`), repartidos por nombre: el feed
 * social compartido (visitantes y clan) y las recompensas recibidas.
 */
const realtimeHandlers = new Map<string, Set<(payload: any) => void>>();

async function connectRealtimeFeeds(): Promise<void> {
  await onRealtime((event) => {
    for (const handler of realtimeHandlers.get(event.name) ?? []) handler(event.payload);
  });
  const on = (name: string, handler: (payload: any) => void) => {
    const set = realtimeHandlers.get(name) ?? new Set();
    set.add(handler);
    realtimeHandlers.set(name, set);
    return () => set.delete(handler);
  };
  connectSocialFeed(on);
  // Un regalo del equipo o un código canjeado en otro dispositivo: se celebra (una vez) y el saldo
  // se vuelve a pedir.
  on('reward:received', (reward: RewardReceived | null) => {
    if (!reward) return;
    celebrateReward(reward);
    void stateRefresh('user').catch(() => {});
  });
}

/**
 * Canjea un código de regalo y celebra lo recibido. El texto del error depende del estado (ya
 * canjeado, demasiados intentos, no vale).
 */
export async function redeemCode(code: string): Promise<void> {
  const reward = (await perform({ type: 'redeemVoucher', code })) as RewardReceived;
  celebrateReward(reward);
  void stateRefresh('user').catch(() => {});
}

/** Una acción del jugador. El estado se actualiza solo: el núcleo lo deja al día. */
export function act(action: Action): Promise<unknown> {
  return perform(action);
}
