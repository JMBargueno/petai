/**
 * Nickname público del jugador (@handle). Mismas reglas que el backend (src/common/user-handle.ts):
 * 3-20 caracteres a-z, 0-9, "_" y "."; empieza por letra; sin ".." ni punto final; sin distinguir
 * mayúsculas. Se guarda sin "@" y se muestra como "@nick". Es único e INMUTABLE.
 */
export const HANDLE_MAX_LENGTH = 20;

/** Quita espacios y una "@" inicial y pasa a minúsculas. */
export function normalizeHandle(raw: string): string {
  return (raw ?? '').trim().replace(/^@/, '').toLowerCase();
}

/** Motivo (para el usuario) por el que el formato no es válido, o null. Las reservadas las decide el servidor. */
export function handleFormatError(handle: string): string | null {
  if (handle.length < 3) return 'Mínimo 3 caracteres';
  if (handle.length > HANDLE_MAX_LENGTH) return `Máximo ${HANDLE_MAX_LENGTH} caracteres`;
  if (!/^[a-z]/.test(handle)) return 'Debe empezar por una letra';
  if (!/^[a-z][a-z0-9_.]*$/.test(handle)) return 'Solo letras (a-z), números, "_" y "."';
  if (handle.includes('..')) return 'Sin dos puntos seguidos';
  if (handle.endsWith('.')) return 'No puede terminar en punto';
  return null;
}

/** "@nick" para mostrar; cadena vacía si la cuenta aún no tiene nickname. */
export function atHandle(handle: string | null | undefined): string {
  return handle ? `@${handle}` : '';
}
