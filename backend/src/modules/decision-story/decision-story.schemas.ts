import { z } from 'zod';

export const storyStartSchema = z.object({ petId: z.string().uuid() }).strict();
export type StoryStartDto = z.infer<typeof storyStartSchema>;

export const storyAnswerSchema = z
  .object({
    sceneIndex: z.number().int().min(0).max(10),
    optionIndex: z.number().int().min(0).max(10),
  })
  .strict();
export type StoryAnswerDto = z.infer<typeof storyAnswerSchema>;

export const storyRegenerateSchema = z
  .object({
    /** Día del bucket (YYYY-MM-DD). Por defecto, hoy en la zona horaria de las historias. */
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Borra antes las historias de ese día que nadie haya empezado, para volver a tejerlas. */
    replace: z.boolean().default(false),
    /** Si la IA falla, rellena con reposiciones o semillas. */
    allowFallback: z.boolean().default(true),
  })
  .strict();
export type StoryRegenerateDto = z.infer<typeof storyRegenerateSchema>;
