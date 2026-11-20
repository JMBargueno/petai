/**
 * Lado de la UI del núcleo cliente de Pockai.
 *
 * El núcleo (Rust, `crates/pockai-core`) lleva la red, la sesión y el tiempo real. La UI no habla
 * con el backend: le pide las cosas al núcleo con estas funciones y escucha sus eventos. Los tipos
 * de `./bindings` se generan desde Rust (`cargo test -p pockai-core export_bindings`).
 */
import type { ApiRequest } from './bindings/ApiRequest';
import type { ApiResponse } from './bindings/ApiResponse';
import type { MaintenanceEvent } from './bindings/MaintenanceEvent';
import type { RealtimeEvent } from './bindings/RealtimeEvent';
import type { RealtimeStatus } from './bindings/RealtimeStatus';
import type { SessionEvent } from './bindings/SessionEvent';
import type { SessionKind } from './bindings/SessionKind';
import type { SessionState } from './bindings/SessionState';
import type { SseEvent } from './bindings/SseEvent';

export type {
  ApiRequest,
  ApiResponse,
  MaintenanceEvent,
  RealtimeEvent,
  RealtimeStatus,
  SessionEvent,
  SessionKind,
  SessionState,
  SseEvent,
};

/** Nombres de los eventos que emite el núcleo (ver `tauri-plugin-pockai`). */
export const CORE_EVENTS = {
  session: 'core://session',
  maintenance: 'core://maintenance',
  realtime: 'core://realtime',
  realtimeStatus: 'core://realtime-status',
} as const;

/** ¿Hay núcleo? Solo dentro de la app (Tauri); en el navegador (modo demo) y en los tests, no. */
export function hasCore(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(`plugin:pockai|${name}`, args);
}

async function listenTo<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, (e) => cb(e.payload));
}

function abortError(): DOMException {
  return new DOMException('La petición se canceló', 'AbortError');
}

/** Convierte una llamada `fetch` en la petición que entiende el núcleo. */
async function toApiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<{ request: ApiRequest; signal: AbortSignal }> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.text() : '';
  return {
    signal: req.signal,
    request: {
      method: req.method,
      path: url.pathname + url.search,
      body: body || null,
      // La cabecera solo marca que la llamada va con sesión: el token lo pone el núcleo.
      auth: req.headers.has('Authorization'),
      contentType: body ? req.headers.get('Content-Type') : null,
    },
  };
}

function toResponse(res: ApiResponse): Response {
  const empty = res.status === 204 || res.status === 205 || res.status === 304;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(res.headers)) {
    if (value !== undefined) headers[name] = value;
  }
  return new Response(empty ? null : res.body, { status: res.status, headers });
}

/**
 * `fetch` contra la API a través del núcleo. Se usa igual que `fetch`: solo importan la ruta, el
 * método, el cuerpo y si lleva cabecera `Authorization` (con cualquier valor) para ir con sesión.
 * El núcleo añade el token, lo renueva ante un 401 y repite la petición una vez.
 * Sin conexión lanza `TypeError`, como `fetch`.
 */
export async function coreFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { request, signal } = await toApiRequest(input, init);
  if (signal.aborted) throw abortError();
  let res: ApiResponse;
  try {
    res = await command<ApiResponse>('api_request', { request });
  } catch (e) {
    throw new TypeError(String(e));
  }
  if (signal.aborted) throw abortError();
  return toResponse(res);
}

let streamSeq = 0;

/**
 * Petición cuya respuesta es un flujo de eventos (el chat). Cada evento llega a `onEvent`. La
 * promesa se resuelve cuando el servidor cierra el flujo; si responde con un error en vez de
 * abrirlo, la respuesta trae ese error y `onEvent` no se llama. Cancelable con `init.signal`.
 */
export async function coreStream(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  onEvent: (event: SseEvent) => void,
): Promise<Response> {
  const { request, signal } = await toApiRequest(input, init);
  if (signal.aborted) throw abortError();
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<SseEvent>();
  channel.onmessage = onEvent;

  const id = `chat-${Date.now().toString(36)}-${++streamSeq}`;
  const cancel = () => void command('chat_cancel', { id }).catch(() => {});
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const res = await command<ApiResponse>('chat_stream', { id, request, onEvent: channel });
    return toResponse(res);
  } catch (e) {
    if (signal.aborted) throw abortError();
    throw new TypeError(String(e));
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

/** ¿Hay sesión guardada en el núcleo? */
export function sessionState(): Promise<SessionState> {
  return command<SessionState>('session_state');
}

/** Cierra la sesión en este dispositivo y la revoca en el servidor. */
export function logout(): Promise<void> {
  return command<void>('session_logout');
}

/**
 * Entrega al núcleo la sesión que guardaban en el webview las versiones anteriores de la app.
 * Devuelve si la adoptó (no lo hace si ya tiene una).
 */
export function importLegacySession(accessToken: string, refreshToken: string, deviceId: string | null): Promise<boolean> {
  return command<boolean>('session_import_legacy', { accessToken, refreshToken, deviceId });
}

/** Arranca el canal en tiempo real; el núcleo lo mantiene y lo reconecta mientras haya sesión. */
export function realtimeStart(): Promise<void> {
  return command<void>('realtime_start');
}

export function realtimeStop(): Promise<void> {
  return command<void>('realtime_stop');
}

/** Cambios de sesión. Devuelve cómo dejar de escuchar. */
export function onSession(cb: (kind: SessionKind) => void): Promise<() => void> {
  return listenTo<SessionEvent>(CORE_EVENTS.session, (e) => cb(e.kind));
}

/** Aviso de mantenimiento, con el cuerpo del 503. */
export function onMaintenance(cb: (body: unknown) => void): Promise<() => void> {
  return listenTo<MaintenanceEvent>(CORE_EVENTS.maintenance, (e) => cb(e.body));
}

/** Eventos del servidor por el canal en tiempo real. */
export function onRealtime(cb: (event: RealtimeEvent) => void): Promise<() => void> {
  return listenTo<RealtimeEvent>(CORE_EVENTS.realtime, cb);
}

/** El canal en tiempo real se conecta o se cae. */
export function onRealtimeStatus(cb: (connected: boolean) => void): Promise<() => void> {
  return listenTo<RealtimeStatus>(CORE_EVENTS.realtimeStatus, (e) => cb(e.connected));
}

// ── Estado global ────────────────────────────────────────────────────────────────────────────

import type { AccountLock } from './bindings/AccountLock';
import type { AppState } from './bindings/AppState';
import type { ChangeSource } from './bindings/ChangeSource';
import type { LoadOptions } from './bindings/LoadOptions';
import type { LoadOutcome } from './bindings/LoadOutcome';
import type { Slice } from './bindings/Slice';
import type { StateChange } from './bindings/StateChange';

export type { AccountLock, AppState, ChangeSource, LoadOptions, LoadOutcome, Slice, StateChange };

/** Nombre del evento con el que el núcleo anuncia cada cambio del estado global. */
export const STATE_EVENT = 'core://state';

/** El estado completo que guarda el núcleo en este momento. */
export function stateSnapshot(): Promise<AppState> {
  return command<AppState>('state_snapshot');
}

/**
 * Pide al núcleo que cargue el estado del backend (tienda y, con sesión, usuario, mascotas, huevos
 * e inventario). Después lo mantiene al día él solo. Los datos llegan por `onStateChange`.
 */
export function stateLoad(options: Partial<LoadOptions> = {}): Promise<LoadOutcome> {
  return command<LoadOutcome>('state_load', { options });
}

/** Vuelve a pedir al servidor una parte del estado. */
export function stateRefresh(slice: Slice): Promise<void> {
  return command<void>('state_refresh', { slice });
}

/** Entrega al núcleo una mascota que la UI acaba de recibir del servidor. */
export function stateApplyPet(pet: unknown, add: boolean): Promise<void> {
  return command<void>('state_apply_pet', { pet, add });
}

/** Cambia campos sueltos de una mascota sin esperar al servidor. */
export function statePatchPet(id: string, patch: Record<string, unknown>): Promise<void> {
  return command<void>('state_patch_pet', { id, patch });
}

/** El jugador elige la mascota activa. */
export function stateSelectPet(id: string): Promise<void> {
  return command<void>('state_select_pet', { id });
}

/** Cada cambio del estado global, en orden. */
export function onStateChange(cb: (change: StateChange) => void): Promise<() => void> {
  return listenTo<StateChange>(STATE_EVENT, cb);
}

// ── Avisos y bandeja ─────────────────────────────────────────────────────────────────────────

import type { Notice } from './bindings/Notice';
import type { NoticeKind } from './bindings/NoticeKind';
import type { NoticePriority } from './bindings/NoticePriority';

export type { Notice, NoticeKind, NoticePriority };

/** Nombre del evento con el que el núcleo pide avisar de algo. */
export const NOTICE_EVENT = 'core://notice';

/**
 * El núcleo ha decidido avisar de algo (la mascota necesita atención, un recordatorio ha vencido).
 * Cómo se muestra lo decide cada plataforma.
 */
export function onNotice(cb: (notice: Notice) => void): Promise<() => void> {
  return listenTo<Notice>(NOTICE_EVENT, cb);
}

/** Guarda en la bandeja un aviso de la mascota que no se pudo mostrar. */
export function inboxPush(notice: unknown): Promise<void> {
  return command<void>('inbox_push', { notice });
}

/** Vacía la bandeja y devuelve lo que había. */
export function inboxTake(): Promise<unknown[]> {
  return command<unknown[]>('inbox_take');
}

/** Marca como leídos todos los avisos de la bandeja. */
export function inboxMarkAllRead(): Promise<void> {
  return command<void>('inbox_mark_all_read');
}

/** Le dice al núcleo si el jugador está delante (ventana visible): va en su latido al servidor. */
export function setPresent(present: boolean): Promise<void> {
  return command<void>('set_present', { present });
}

// ── Acciones del jugador ─────────────────────────────────────────────────────────────────────

import type { Action } from './bindings/Action';
import type { ActionError } from './bindings/ActionError';

export type { Action, ActionError };

/**
 * Hace una acción del jugador (dar de comer, eclosionar, comprar…). La UI dice *qué* quiere hacer;
 * la petición la construye el núcleo, que además deja el estado global al día. Devuelve lo que
 * responde el servidor. Si falla, rechaza con un `ActionError` (`status` es `null` sin conexión).
 */
export function perform<T = unknown>(action: Action): Promise<T> {
  return command<T>('perform', { action });
}

import type { Query } from './bindings/Query';

export type { Query };

/**
 * Hace una consulta (listas, perfiles, historiales, clasificaciones…). La UI dice *qué* quiere saber;
 * la petición la construye el núcleo. Si falla, rechaza con un `ActionError`.
 */
export function query<T = unknown>(q: Query): Promise<T> {
  return command<T>('query', { query: q });
}
