import { writable, derived } from 'svelte/store';

/**
 * Inbox offline de notificaciones con personalidad (feature 007 / US3).
 *
 * Svelte store persistente (localStorage) con los avisos `pet:notification` que no se pudieron
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento lleno/indisponible: se ignora */
  }
}

/** Cola de avisos pendientes (más recientes primero). */
export const inbox = writable<InboxNotification[]>(load());

/** Cantidad de avisos no leídos (badge de la bandeja). */
export const unreadCount = derived(inbox, ($i) => $i.filter((n) => !n.read).length);

/** Añade un aviso a la cola (sin duplicar uno idéntico muy reciente) y persiste. */
export function pushInbox(n: InboxNotification) {
  inbox.update((list) => {
    const next = [n, ...list].slice(0, MAX_ITEMS);
    persist(next);
    return next;
  });
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
}

/** Limpia por completo el inbox. */
export function clearInbox() {
  persist([]);
  inbox.set([]);
}
