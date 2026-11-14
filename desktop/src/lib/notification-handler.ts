import type { Socket } from 'socket.io-client';
import { InboxNotification, pushInbox, takeInbox } from './notification-inbox';

/**
 * Handler de notificaciones con personalidad (feature 007 / US3).
 *
 * Suscribe al evento WebSocket `pet:notification` (namespace `realtime`) y lo entrega como
 * notificación **nativa** de Tauri (`title = petName`, `body = message`). Si no se puede entregar
 * de forma nativa (sin permiso, Tauri no disponible o WS caído), se acumula en el `inbox` offline.
 * Al reconectar, la cola se reenvía (flush).
 *
 * El backend **no** envía la imagen del avatar (el escritorio ya la tiene); solo título/cuerpo.
 */

/** Intenta entregar el aviso de forma nativa. Devuelve `true` si se mostró, `false` si no. */
async function trySendNative(n: InboxNotification): Promise<boolean> {
  const title = n.petName || 'Tu mascota';
  const body = n.message || '';
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const tauri = await import('@tauri-apps/plugin-notification');
      let granted = await tauri.isPermissionGranted();
      if (!granted) granted = (await tauri.requestPermission()) === 'granted';
      if (granted) {
        await tauri.sendNotification({ title, body });
        return true;
      }
      return false; // sin permiso: al inbox
    }
    // Alternativa en navegador (desarrollo fuera de Tauri).
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[notifs] no se pudo entregar la notificación nativa:', err);
    return false;
  }
}

let boundSocket: Socket | null = null;

/**
 * Inicializa el handler sobre el socket realtime. Llamarlo una sola vez al conectar (ver
 * `App.svelte`). Los avisos entregables se muestran al instante; los no entregables se apilan en el
 * inbox y se reenvían en el siguiente `connect`.
 */
export function initNotificationHandler(socket: Socket): void {
  if (boundSocket && boundSocket !== socket) stopNotificationHandler();
  boundSocket = socket;

  socket.on('pet:notification', (payload: InboxNotification) => {
    if (!payload?.message) return;
    void (async () => {
      const shown = await trySendNative({ read: false, ...payload });
      if (!shown) pushInbox({ read: false, ...payload });
    })();
  });

  // Al (re)conectar: se reenvía la cola acumulada mientras estuvo offline.
  socket.on('connect', () => {
    const pending = takeInbox();
    for (const n of pending) void trySendNative(n);
  });

  socket.on('disconnect', (reason) => {
    console.log('[notifs] WS desconectado:', reason, '(los avisos se acumulan en el inbox)');
  });
}

/** Suelta los listeners del handler (cierre de sesión / destrucción de la app). */
export function stopNotificationHandler(): void {
  if (boundSocket) {
    boundSocket.off('pet:notification');
    boundSocket.off('connect');
    boundSocket.off('disconnect');
    boundSocket = null;
  }
}
