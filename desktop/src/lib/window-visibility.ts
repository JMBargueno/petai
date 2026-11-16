/**
 * ¿Está el pockai a la vista? Si lo está, lo que tenga que decir lo dice él en su bocadillo; si la
 * ventana está oculta (bandeja) o minimizada, se recurre a la notificación nativa del sistema.
 */
let petOnScreen = false;

/** La vista de la mascota avisa al montarse/desmontarse (p. ej. al irse a su hábitat no se ve). */
export function setPetOnScreen(value: boolean) {
  petOnScreen = value;
}

export async function isPetVisible(): Promise<boolean> {
  if (typeof window === 'undefined' || !petOnScreen) return false;
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const [visible, minimized] = await Promise.all([win.isVisible(), win.isMinimized()]);
      return visible && !minimized;
    } catch {
      // Sin permisos o API no disponible: se asume visible (la ventana es siempre-encima)
      return true;
    }
  }
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}
