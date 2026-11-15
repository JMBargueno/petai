/**
 * Longitud máxima del nombre (nickname) de una mascota. Es el tope tanto para el nombre que el
 * usuario elige al eclosionar como para el renombre de un admin.
 */
export const MAX_PET_NAME_LENGTH = 16;

/** Mensaje de error compartido por el contrato de API cuando el nombre no tiene 1-16 caracteres. */
export const PET_NAME_INVALID_MESSAGE = 'El nombre debe tener entre 1 y 16 caracteres';

/**
 * Resultado de la normalización de un nickname. Permite distinguir tres casos observables:
 * - `{ name }`: nickname válido (texto normalizado, 1-16 chars).
 * - `{ empty }`: ausente o vacío tras limpiar (el flujo de eclosión genera uno aleatorio; el
 *   renombre admin lo rechaza).
 * - `{ invalid }`: supera la longitud máxima → 400 en ambos flujos.
 */
export type PetNameValidation = { name: string } | { empty: true } | { invalid: true };

/**
 * Normaliza un nickname según el contrato: elimina los caracteres de control (U+0000-U+001F y U+007F)
 * y hace trim. Un valor que no es texto se trata como ausente (`empty`). Devuelve uno de los tres
 * casos de {@link PetNameValidation}; el mapeo al comportamiento de cada endpoint lo decide el
 * llamador (eclosión: `empty` → aleatorio; renombre: `empty`/`invalid` → 400).
 */
export function normalizePetName(value: unknown): PetNameValidation {
  if (typeof value !== 'string') return { empty: true };
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (cleaned.length === 0) return { empty: true };
  if (cleaned.length > MAX_PET_NAME_LENGTH) return { invalid: true };
  return { name: cleaned };
}