/// <reference types="vite/client" />
// Actualizaciones de la app de escritorio (plugin updater de Tauri).
// El endpoint es el backend (`/v1/desktop/updates/...`), que hace de proxy de los releases del repo privado.
// Se comprueba sola al arrancar y cada 6 h; el usuario puede forzarla en Ajustes › Acerca de o desde la bandeja.
import { writable, get } from 'svelte/store';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'upToDate' }
  | { status: 'available'; version: string; notes: string }
  | { status: 'downloading'; version: string; progress: number | null }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

export const updateState = writable<UpdateState>({ status: 'idle' });

const STARTUP_DELAY_MS = 10_000; // 10 s tras arrancar
const INTERVAL_MS = 30 * 60 * 1000; // Cada 30 minutos

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let pending: Update | null = null;
let checking: Promise<void> | null = null;

/** Indica si hay una versión nueva lista para instalar (para badges). */
export function hasUpdate(s: UpdateState): boolean {
  return s.status === 'available' || s.status === 'downloading' || s.status === 'ready';
}

/**
 * Busca una versión nueva. En modo `silent` (comprobación automática) los errores no se muestran:
 * sin red o con el backend caído simplemente no hay aviso.
 */
export function checkForUpdates({ silent = false } = {}): Promise<void> {
  if (!isTauri()) {
    if (!silent) updateState.set({ status: 'error', message: 'Las actualizaciones solo funcionan en la app de escritorio.' });
    return Promise.resolve();
  }
  const current = get(updateState).status;
  if (current === 'downloading' || current === 'ready') return Promise.resolve();
  if (checking) return checking;

  checking = (async () => {
    const previous = get(updateState);
    if (!silent) updateState.set({ status: 'checking' });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        pending = update;
        updateState.set({ status: 'available', version: update.version, notes: update.body ?? '' });
      } else {
        pending = null;
        updateState.set(silent && previous.status === 'idle' ? { status: 'idle' } : { status: 'upToDate' });
      }
    } catch (err) {
      console.warn('[updater] no se pudo comprobar la actualización', err);
      if (silent) updateState.set(previous);
      else updateState.set({ status: 'error', message: 'No he podido comprobar si hay actualizaciones. Inténtalo más tarde.' });
    } finally {
      checking = null;
    }
  })();
  return checking;
}

/** Descarga e instala la actualización pendiente y reinicia la app. */
export async function installUpdate(): Promise<void> {
  if (!isTauri() && !pending) {
    const s = get(updateState);
    if (s.status === 'available') {
      updateState.set({ status: 'downloading', version: s.version, progress: 0.45 });
      setTimeout(() => {
        updateState.set({ status: 'downloading', version: s.version, progress: 0.90 });
        setTimeout(() => {
          updateState.set({ status: 'ready', version: s.version });
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }, 800);
      }, 800);
    }
    return;
  }
  if (!pending) return;
  const update = pending;
  let total = 0;
  let downloaded = 0;
  updateState.set({ status: 'downloading', version: update.version, progress: null });
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0;
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        const progress = total > 0 ? Math.min(1, downloaded / total) : null;
        updateState.set({ status: 'downloading', version: update.version, progress });
      } else if (event.event === 'Finished') {
        updateState.set({ status: 'ready', version: update.version });
      }
    });
    updateState.set({ status: 'ready', version: update.version });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    console.warn('[updater] fallo al instalar la actualización', err);
    updateState.set({ status: 'error', message: 'No se pudo instalar la actualización. Vuelve a intentarlo.' });
  }
}

/**
 * Comprobación automática: a los 10 s del arranque y cada 30 min. No hace nada en `vite dev`
 * ni fuera de Tauri. Devuelve la función para pararla.
 */
export function startAutoCheck(): () => void {
  if (import.meta.env.DEV || !isTauri()) return () => {};
  const first = setTimeout(() => void checkForUpdates({ silent: true }), STARTUP_DELAY_MS);
  const every = setInterval(() => void checkForUpdates({ silent: true }), INTERVAL_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}

/** Helper para pruebas y depuración en DEV / tests. */
export function mockTriggerUpdate(version: string, notes = 'Actualización obligatoria con mejoras y correcciones de compatibilidad.'): void {
  updateState.set({ status: 'available', version, notes });
}
