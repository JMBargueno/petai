export interface ActiveWindowInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  is_valid: boolean;
}

/**
 * Consulta la ventana en primer plano del sistema operativo a través del backend Tauri/Win32.
 */
export async function fetchActiveWindow(): Promise<ActiveWindowInfo | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return null;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<ActiveWindowInfo>('get_active_window_info');
    if (!info || !info.is_valid) return null;
    return info;
  } catch (err) {
    console.debug('[windowPerching] Error consultando ventana activa:', err);
    return null;
  }
}

/**
 * Calcula si una posición dada cae sobre la barra superior de una ventana para posarse.
 */
export function calculatePerchTarget(
  win: ActiveWindowInfo,
  petSize = 128
): { x: number; y: number } {
  // Posarse centrado o en el tercio derecho de la barra de título
  const targetX = Math.min(
    Math.max(win.x + 40, win.x + win.w * 0.6),
    win.x + win.w - petSize - 20
  );
  // Las patitas se apoyan sobre el borde superior (ligeramente superpuesto)
  const targetY = Math.max(0, win.y - petSize + 16);

  return { x: targetX, y: targetY };
}
