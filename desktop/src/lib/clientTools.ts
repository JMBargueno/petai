// Herramientas que ejecuta la app de escritorio en este equipo. El servidor solo las propone y
// las valida; aquí se ejecutan DESPUÉS de que el usuario pulse "Confirmar" en la tarjeta.

/** Herramientas de escritorio que esta app declara soportar al servidor. */
export const CLIENT_TOOLS = ['open_url', 'read_clipboard'] as const;

const BLOCKED = /^(localhost|.*\.(localhost|local|internal|lan))$/i;
const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;

/** Segunda comprobación en el cliente (defensa en profundidad): solo http(s) público. */
export function isSafeToOpen(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const h = u.hostname.replace(/^\[|\]$/g, '');
    if (!h || BLOCKED.test(h) || PRIVATE_V4.test(h) || h === '::1' || !h.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}

export async function openUrl(url: string) {
  if (!isSafeToOpen(url)) throw new Error('Este enlace no es seguro para abrirlo');
  if ('__TAURI_INTERNALS__' in window) {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText) throw new Error('Este entorno no permite leer el portapapeles');
  return navigator.clipboard.readText();
}
