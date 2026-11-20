/**
 * Permiso de notificaciones. Los avisos de cuidado los muestra el trabajo en segundo plano del
 * núcleo con la app cerrada (WorkManager en Android; en iOS, `BGAppRefreshTask`, que es el paso 4.8
 * y aún no está). El permiso solo se puede pedir con la app abierta, así que se pide una vez, al
 * entrar. El plugin de Tauri es el mismo en las dos plataformas.
 */
import { hasCore } from './core';

const ASKED = 'pockai.notificationsAsked';

export async function askNotificationsOnce(): Promise<void> {
  if (!hasCore() || localStorage.getItem(ASKED)) return;
  try {
    const n = await import('@tauri-apps/plugin-notification');
    if (!(await n.isPermissionGranted())) await n.requestPermission();
    localStorage.setItem(ASKED, '1');
  } catch (e) {
    console.warn('[notificaciones] no se pudo pedir el permiso:', e);
  }
}
