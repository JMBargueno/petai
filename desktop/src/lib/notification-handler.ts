import type { Socket } from 'socket.io-client';
import { InboxNotification, pushInbox, takeInbox } from './notification-inbox';
import { sendNative } from './notifications';
import { speak } from './speech-queue';
import { isPetVisible } from './window-visibility';

/**
 * Handler de notificaciones con personalidad (feature 007 / US3).
 *
 * Suscribe al evento WebSocket `pet:notification` (namespace `realtime`). Hay una sola vía de habla:
 * si la mascota está a la vista lo dice ella en su bocadillo (cola de `speech-queue`); si la ventana
 * está oculta o minimizada se entrega como notificación **nativa** (`title = petName`,
 * `body = message`). Si tampoco se puede (sin permiso, Tauri no disponible), se acumula en el
 * `inbox` offline y se reenvía al reconectar.
 *
 * El backend **no** envía la imagen del avatar (el escritorio ya la tiene); solo título/cuerpo.
 */

/** Intenta entregar el aviso. Devuelve `true` si llegó (bocadillo o nativa), `false` si no. */
async function deliver(n: InboxNotification): Promise<boolean> {
  const body = n.message || '';
  if (!body) return true;
  try {
    if (await isPetVisible()) {
      speak(body);
      return true;
    }
    return await sendNative(n.petName || 'Tu mascota', body);
  } catch (err) {
    console.warn('[notifs] no se pudo entregar el aviso:', err);
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
      const shown = await deliver({ read: false, ...payload });
      if (!shown) pushInbox({ read: false, ...payload });
    })();
  });

  // Al (re)conectar: se reenvía la cola acumulada mientras estuvo offline.
  socket.on('connect', () => {
    const pending = takeInbox();
    for (const n of pending) void deliver(n);
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
