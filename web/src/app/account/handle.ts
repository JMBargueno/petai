/**
 * Nickname público (@handle). Mismas reglas que el backend (backend/src/common/user-handle.ts) y que
 * el escritorio (desktop/src/lib/handle.ts): 3-20 caracteres a-z, 0-9, "_" y "."; empieza por letra;
 * sin ".." ni punto final. Las palabras reservadas las decide el servidor.
 */
export const HANDLE_MAX_LENGTH = 20;

/** Quita espacios y una "@" inicial y pasa a minúsculas. */
export function normalizeHandle(raw: string): string {
  return (raw ?? '').trim().replace(/^@/, '').toLowerCase();
}

/** Motivo por el que el formato no es válido, o null. */
export function handleFormatError(handle: string): string | null {
  if (handle.length < 3) return $localize`:@@handle.min:Mínimo 3 caracteres`;
  if (handle.length > HANDLE_MAX_LENGTH) return $localize`:@@handle.max:Máximo 20 caracteres`;
  if (!/^[a-z]/.test(handle)) return $localize`:@@handle.letter:Debe empezar por una letra`;
  if (!/^[a-z][a-z0-9_.]*$/.test(handle)) return $localize`:@@handle.chars:Solo letras (a-z), números, «_» y «.»`;
  if (handle.includes('..')) return $localize`:@@handle.dots:Sin dos puntos seguidos`;
  if (handle.endsWith('.')) return $localize`:@@handle.endDot:No puede terminar en punto`;
  return null;
}
