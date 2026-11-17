import { z } from 'zod';

/** PATCH /admin/site-settings: todos los campos son opcionales (actualización parcial). */
export const siteSettingsSchema = z
  .object({
    comingSoonEnabled: z.boolean({ message: 'comingSoonEnabled debe ser booleano' }).optional(),
    comingSoonCountdownEnabled: z.boolean({ message: 'comingSoonCountdownEnabled debe ser booleano' }).optional(),
    comingSoonLaunchAt: z
      .union([z.null(), z.coerce.date({ message: 'comingSoonLaunchAt no es una fecha válida' })])
      .optional(),
  })
  .strict();

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
