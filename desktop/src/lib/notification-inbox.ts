import { writable, derived } from 'svelte/store';
import { hasCore, inboxMarkAllRead, inboxPush, inboxTake } from '@pockai/client';

/**
 * Inbox offline de notificaciones con personalidad (feature 007 / US3).
 *
 * Dentro de la app la bandeja la guarda el núcleo (Rust): este store solo la refleja y le entrega
 * los cambios. En el navegador (modo demo) se guarda en localStorage, como antes.
 *
 * Svelte store persistente con los avisos `pet:notification` que no se pudieron
 * entregar de forma nativa (WS caído o sin permiso). Se expone `unreadCount` para el badge de la
 * bandeja; al reconectar, `takeInbox()` vacía la cola para que el handler la reenvíe.
 */
export interface InboxNotification {
  petId: string;
  petName: string;
  type: string;
  message: string;
  category: string;
  source?: 'ai' | 'template';
  timestamp: string;
  read: boolean;
}

const STORAGE_KEY = 'petai_notification_inbox';
const MAX_ITEMS = 100;

function load(): InboxNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InboxNotification[]) : [];
  } catch {
    return [];
  }
}

function persist(list: InboxNotification[]) {
  if (hasCore()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento lleno/indisponible: se ignora */
  }
}

/** Cola de avisos pendientes (más recientes primero). */
export const inbox = writable<InboxNotification[]>(hasCore() ? [] : load());

/** La bandeja que guarda el núcleo (la pone `appState` al reflejar su estado). */
export function setInboxFromCore(list: InboxNotification[]) {
  inbox.set(list);
}

/**
 * Avisos que guardaba el webview en versiones anteriores: se devuelven una vez (para pasarlos al
 * núcleo) y se borran de aquí.
 */
export function takeLegacyInbox(): InboxNotification[] {
  const legacy = load();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento indisponible */
  }
  return legacy;
}

/** Cantidad de avisos no leídos (badge de la bandeja). */
export const unreadCount = derived(inbox, ($i) => $i.filter((n) => !n.read).length);

/** Añade un aviso a la cola (sin duplicar uno idéntico muy reciente) y persiste. */
export function pushInbox(n: InboxNotification) {
  inbox.update((list) => {
    const next = [n, ...list].slice(0, MAX_ITEMS);
    persist(next);
    return next;
  });
  if (hasCore()) void inboxPush(n).catch(() => {});
}

/**
 * Vacía la cola y la devuelve (para reenviarla al reconectar). Devuelve `[]` si estaba vacía.
 */
export function takeInbox(): InboxNotification[] {
  let out: InboxNotification[] = [];
  inbox.update((list) => {
    out = list;
    persist([]);
    return [];
  });
  if (hasCore()) void inboxTake().catch(() => {});
  return out;
}

/** Marca todos los avisos como leídos (mantiene la lista, solo el flag). */
export function markAllRead() {
  inbox.update((list) => {
    if (list.every((n) => n.read)) return list;
    const next = list.map((n) => ({ ...n, read: true }));
    persist(next);
    return next;
  });
  if (hasCore()) void inboxMarkAllRead().catch(() => {});
}

/** Limpia por completo el inbox. */
export function clearInbox() {
  persist([]);
  inbox.set([]);
  if (hasCore()) void inboxTake().catch(() => {});
}
