/**
 * Permiso de notificaciones. Los avisos de cuidado los muestra el trabajo en segundo plano del
 * núcleo (WorkManager, en `tauri-plugin-pockai`) con la app cerrada; desde Android 13 hace falta
 * pedir el permiso, y eso solo se puede desde la app abierta. Se pide una vez, al entrar.
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
