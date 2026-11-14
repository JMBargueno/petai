import { z } from 'zod';

/**
 * S-10: validación de entrada de aventura. `petId`/`adventureId` no vacíos, `premium` booleano,
 * `optionIndex` entero ≥ 0. El rango real de la opción lo valida el service (nº de escenas).
 */
export const adventureStartSchema = z
  .object({
    petId: z.string().min(1, 'petId es obligatorio'),
    premium: z.boolean().optional(),
  })
  .strict();

export const adventureChooseSchema = z
  .object({
    adventureId: z.string().min(1, 'adventureId es obligatorio'),
    optionIndex: z.number().int('optionIndex debe ser un entero').min(0, 'optionIndex debe ser ≥ 0'),
  })
  .strict();

export type AdventureStartInput = z.infer<typeof adventureStartSchema>;
export type AdventureChooseInput = z.infer<typeof adventureChooseSchema>;