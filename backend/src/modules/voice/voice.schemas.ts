import { z } from 'zod';

/**
 * S-10: validación de entrada de voz. La acotación de tamaño vive aquí (en vez del `if` manual
 * del controller): base64 ≤ 10MB, texto ≤ 5000, `lang`/`mood` acotados. `.strict()` rechaza
 * campos sobrantes.
 */
export const transcribeSchema = z
  .object({
    audio: z
      .string()
      .min(1, 'audio es obligatorio (base64)')
      .max(10 * 1024 * 1024, 'audio demasiado grande (máx 10MB base64)'),
    lang: z.string().max(16, 'lang demasiado largo').optional(),
  })
  .strict();

export const speakSchema = z
  .object({
    text: z.string().min(1, 'text es obligatorio').max(5000, 'text demasiado largo (máx 5000)'),
    speciesId: z.string().min(1, 'speciesId es obligatorio'),
    mood: z.string().max(32, 'mood demasiado largo').optional(),
  })
  .strict();

export type TranscribeInput = z.infer<typeof transcribeSchema>;
export type SpeakInput = z.infer<typeof speakSchema>;