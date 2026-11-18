import { z } from 'zod';

/**
 * Nickname público del jugador (`@jmbargueno`). En código se llama `handle` para no confundirlo con
 * `Pet.nickname`. Reglas:
 * - 3-20 caracteres: letras minúsculas a-z, dígitos, `_` y `.`; empieza por letra.
 * - Sin `..` y sin punto final.
 * - No distingue mayúsculas: se guarda siempre en minúsculas y sin la `@` inicial.
 * - Único e INMUTABLE: se fija una sola vez (registro o pantalla "elige tu nickname"). La base de
 *   datos lo garantiza con un CHECK de formato y un trigger que impide cambiarlo.
 */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
/** Misma regla que el CHECK "User_handle_format_check" de la migración. */
export const HANDLE_REGEX = /^[a-z][a-z0-9_.]{2,19}$/;

/** Nicknames que nadie puede usar (suplantación del equipo o colisiones con rutas). */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'administrador',
  'administrator',
  'root',
  'system',
  'sistema',
  'soporte',
  'support',
  'help',
  'ayuda',
  'staff',
  'equipo',
  'team',
  'moderador',
  'moderator',
  'mod',
  'pockai',
  'pockai_team',
  'pockaiteam',
  'petai',
  'oficial',
  'official',
  'null',
  'undefined',
  'me',
  'yo',
  'api',
  'www',
  'nobody',
  'anonymous',
  'anonimo',
]);

/** Quita espacios y una `@` inicial y pasa a minúsculas. Un valor que no es texto devuelve ''. */
export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^@/, '').toLowerCase();
}

/** Motivo por el que un nickname no es válido (texto para el usuario), o `null` si lo es. */
export function handleInvalidReason(handle: string): string | null {
  if (handle.length < HANDLE_MIN_LENGTH) return `El nickname debe tener al menos ${HANDLE_MIN_LENGTH} caracteres`;
  if (handle.length > HANDLE_MAX_LENGTH) return `El nickname no puede superar los ${HANDLE_MAX_LENGTH} caracteres`;
  if (!/^[a-z]/.test(handle)) return 'El nickname debe empezar por una letra';
  if (!HANDLE_REGEX.test(handle)) return 'El nickname solo puede tener letras (a-z), números, "_" y "."';
  if (handle.includes('..')) return 'El nickname no puede tener dos puntos seguidos';
  if (handle.endsWith('.')) return 'El nickname no puede terminar en punto';
  if (RESERVED_HANDLES.has(handle)) return 'Ese nickname está reservado';
  return null;
}

export function isHandleValid(handle: string): boolean {
  return handleInvalidReason(handle) === null;
}

/** Esquema zod: normaliza y valida (mensajes en español). */
export const handleSchema = z
  .string({ error: (issue) => (issue.input === undefined ? 'handle es obligatorio' : 'handle debe ser un texto') })
  .transform((v) => normalizeHandle(v))
  .superRefine((v, ctx) => {
    const reason = handleInvalidReason(v);
    if (reason) ctx.addIssue({ code: 'custom', message: reason });
  });

/** Nombre visible por defecto si la cuenta no da ni nombre ni nickname. Nunca se deriva del correo (es privado). */
export const DEFAULT_DISPLAY_NAME = 'Entrenador';

/**
 * Nombre que el registro antiguo ponía por defecto (parte local del correo, máx. 50). Sirve para
 * detectar cuentas que aún lo tienen y sustituirlo, porque filtra el correo a amigos y clanes.
 */
export function legacyEmailDisplayName(email: string): string {
  return email.split('@')[0].slice(0, 50);
}

/** Mensaje para clientes antiguos que aún buscan jugadores por email (amigos, clanes). */
export const EMAIL_LOOKUP_REMOVED_MESSAGE = 'Ahora se busca a los jugadores por su @nickname. Actualiza la app';

/**
 * Busca el id de un usuario por su nickname (con o sin `@`). `null` si el formato no es válido o
 * nadie lo usa (el llamador decide el 404).
 */
export async function findUserIdByHandle(
  prisma: { user: { findUnique: (args: { where: { handle: string }; select: { id: true } }) => Promise<{ id: string } | null> } },
  raw: unknown,
): Promise<string | null> {
  const handle = normalizeHandle(raw);
  if (!HANDLE_REGEX.test(handle)) return null;
  const user = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * ¿El error de Prisma es una violación de unicidad sobre `field`? Según la versión, `meta.target`
 * es un array de campos (`['handle']`) o el nombre del índice (`User_handle_key`).
 */
export function isUniqueViolationOn(err: unknown, field: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target === field || target.includes(`_${field}_`);
  return false;
}
