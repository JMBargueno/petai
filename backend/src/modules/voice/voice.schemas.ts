import { z } from 'zod';

/**
 * S-10: validación de entrada de voz. `.strict()` rechaza campos sobrantes.
 *
 * F-08: el audio ya no llega como base64 dentro de un JSON (el límite de 100 KB del body parser
 * hacía inutilizable la ruta) sino como fichero multipart; su límite de tamaño vive en la ruta
 * (`VOICE_MAX_AUDIO_BYTES`, multer). Aquí solo quedan los campos del formulario (`lang`) y los
 * campos de `speak` (texto ≤ 5000, `mood` acotado).
 */
export const transcribeFieldsSchema = z
  .object({
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

export type TranscribeFields = z.infer<typeof transcribeFieldsSchema>;
export type SpeakInput = z.infer<typeof speakSchema>;