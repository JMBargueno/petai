import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { NOTIFICATION_CATEGORIES } from '../notification-rules';

/**
 * Preferencias de notificaciones (feature 007). Todas las propiedades son opcionales: un `PATCH /me`
 * hace merge parcial (solo se sobreescriben los campos presentes). `maxPerDay` va de 1 a 10.
 */
export const NotificationPrefsSchema = z.object({
  vitals_critical: z.boolean().optional(),
  interaction: z.boolean().optional(),
  achievement: z.boolean().optional(),
  arena: z.boolean().optional(),
  event: z.boolean().optional(),
  maxPerDay: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional(),
});

export type NotificationPrefsInput = z.infer<typeof NotificationPrefsSchema>;

/** Clase DTO para `@nestjs/swagger` (documentación de OpenAPI). */
export class NotificationPrefsDto {
  @ApiPropertyOptional({ type: 'boolean', description: 'Notificar vitales críticas', example: true })
  vitals_critical?: boolean;

  @ApiPropertyOptional({ type: 'boolean', description: 'Notificar interacciones', example: true })
  interaction?: boolean;

  @ApiPropertyOptional({ type: 'boolean', description: 'Notificar logros (misiones, niveles, evoluciones)', example: true })
  achievement?: boolean;

  @ApiPropertyOptional({ type: 'boolean', description: 'Notificar eventos de arena (victorias/derrotas)', example: true })
  arena?: boolean;

  @ApiPropertyOptional({ type: 'boolean', description: 'Notificar eventos globales', example: true })
  event?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 10, description: 'Máximo de notificaciones por día', example: 3 })
  maxPerDay?: number;
}

/**
 * Valida un cuerpo `notificationPrefs` parcial. Devuelve el input ya validado o lanza un error de
 * formato legible. `null`/`undefined` ⇒ vacíos (no se cambia nada).
 */
export function parseNotificationPrefs(body: unknown): NotificationPrefsInput {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('notificationPrefs debe ser un objeto');
  }
  const keys = new Set<string>([...NOTIFICATION_CATEGORIES, 'maxPerDay']);
  const unknown = Object.keys(body as object).filter((k) => !keys.has(k));
  if (unknown.length > 0) {
    throw new Error(`Categoría desconocida: ${unknown.join(', ')}`);
  }
  const parsed = NotificationPrefsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path.includes('maxPerDay')) {
      throw new Error('maxPerDay debe estar entre 1 y 10');
    }
    throw new Error('notificationPrefs inválido');
  }
  return parsed.data;
}
