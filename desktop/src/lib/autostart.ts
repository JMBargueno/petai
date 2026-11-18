/**
 * «Iniciar Pockai al iniciar Windows» (plugin autostart de Tauri). Se activa por defecto en la primera
 * ejecución desde Rust (main.rs); aquí solo se consulta y se cambia desde Ajustes › Aplicación.
 * Fuera de Tauri (navegador, tests) no hace nada.
 */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isAutostartSupported(): boolean {
  return inTauri();
}

export async function isAutostartEnabled(): Promise<boolean> {
  if (!inTauri()) return false;
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return isEnabled();
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!inTauri()) return;
  const { enable, disable } = await import('@tauri-apps/plugin-autostart');
  await (enabled ? enable() : disable());
}
