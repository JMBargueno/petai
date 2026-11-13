import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Validación estricta de las entradas de autenticación. Los DTO de dto/auth.dto.ts solo documentan
 * Swagger; la validación real se hace aquí (zod) para no depender de decoradores globales.
 */

const email = z
  .string({ required_error: 'email es obligatorio', invalid_type_error: 'email debe ser un texto' })
  .trim()
  .toLowerCase()
  .max(254, 'email demasiado largo')
  .email('email no es válido');

const password = z
  .string({ required_error: 'password es obligatoria', invalid_type_error: 'password debe ser un texto' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no puede superar los 128 caracteres');

const displayName = z
  .string({ invalid_type_error: 'displayName debe ser un texto' })
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim())
  .pipe(z.string().min(1, 'displayName no puede estar vacío').max(50, 'displayName no puede superar los 50 caracteres'))
  .optional();

export const registerSchema = z.object({ email, password, displayName });

// En el login no se exige la política de contraseña (las cuentas antiguas podrían incumplirla),
// solo un tope de longitud para no hashear cuerpos enormes.
export const loginSchema = z.object({
  email,
  password: z
    .string({ required_error: 'password es obligatoria', invalid_type_error: 'password debe ser un texto' })
    .min(1, 'password es obligatoria')
    .max(128, 'La contraseña no puede superar los 128 caracteres'),
});

export const refreshSchema = z.object({
  refreshToken: z
    .string({ required_error: 'refreshToken es obligatorio', invalid_type_error: 'refreshToken debe ser un texto' })
    .min(10)
    .max(4096),
});

/** Valida y devuelve los datos tipados; ante un error responde 400 con el primer motivo. */
export function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Datos no válidos');
  }
  return result.data;
}
