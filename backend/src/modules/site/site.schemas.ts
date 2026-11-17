import { z } from 'zod';

/** A quién afecta el mantenimiento manual: solo la web, solo las apps (escritorio/móvil) o todo. */
export const MAINTENANCE_SCOPES = ['web', 'apps', 'all'] as const;
export type MaintenanceScope = (typeof MAINTENANCE_SCOPES)[number];

export const MAINTENANCE_MESSAGE_MAX = 1000;

const message = (field: string) =>
  z
    .union([
      z.null(),
      z
        .string({ message: `${field} debe ser texto` })
        .max(MAINTENANCE_MESSAGE_MAX, `${field} admite como mucho ${MAINTENANCE_MESSAGE_MAX} caracteres`)
        // Un mensaje en blanco equivale a no tener mensaje (se usa el texto por defecto).
        .transform((v) => v.trim() || null),
    ])
    .optional();

/** PATCH /admin/site-settings: todos los campos son opcionales (actualización parcial). */
export const siteSettingsSchema = z
  .object({
    comingSoonEnabled: z.boolean({ message: 'comingSoonEnabled debe ser booleano' }).optional(),
    comingSoonCountdownEnabled: z.boolean({ message: 'comingSoonCountdownEnabled debe ser booleano' }).optional(),
    comingSoonLaunchAt: z
      .union([z.null(), z.coerce.date({ message: 'comingSoonLaunchAt no es una fecha válida' })])
      .optional(),
    maintenanceEnabled: z.boolean({ message: 'maintenanceEnabled debe ser booleano' }).optional(),
    maintenanceScope: z.enum(MAINTENANCE_SCOPES, { message: 'maintenanceScope debe ser web, apps o all' }).optional(),
    maintenanceMessageEs: message('maintenanceMessageEs'),
    maintenanceMessageEn: message('maintenanceMessageEn'),
  })
  .strict();

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
