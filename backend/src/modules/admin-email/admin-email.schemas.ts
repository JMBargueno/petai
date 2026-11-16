import { z } from 'zod';
import { ROLES } from '../authz/roles';

/** Máximo de destinatarios en los modos "usuarios concretos" y "lista de correos". */
export const MAX_DIRECT_RECIPIENTS = 500;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => z.email().safeParse(v).success, { error: (i) => `Correo no válido: ${String(i.input)}` });

/** Destinatarios de un envío. */
export const audienceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('users'),
    userIds: z.array(z.uuid({ error: 'userIds contiene un id no válido' })).min(1, 'Elige al menos un usuario').max(MAX_DIRECT_RECIPIENTS),
  }),
  z.object({
    type: z.literal('emails'),
    emails: z.array(email).min(1, 'Escribe al menos un correo').max(MAX_DIRECT_RECIPIENTS),
  }),
  z.object({
    type: z.literal('segment'),
    role: z.enum(ROLES).optional(),
    verified: z.enum(['any', 'verified', 'unverified']).default('any'),
  }),
], { error: 'audience no es válido' });
export type Audience = z.infer<typeof audienceSchema>;

/** Contenido del correo: asunto, preencabezado y cuerpo en HTML libre. */
export const contentSchema = z.object({
  subject: z.string({ error: 'El asunto es obligatorio' }).trim().min(1, 'El asunto es obligatorio').max(200, 'El asunto no puede superar los 200 caracteres'),
  preheader: z
    .string()
    .trim()
    .max(200, 'El preencabezado no puede superar los 200 caracteres')
    .optional()
    .transform((v) => v || undefined),
  html: z.string({ error: 'El cuerpo es obligatorio' }).trim().min(1, 'El cuerpo es obligatorio').max(200_000, 'El cuerpo es demasiado largo'),
});
export type EmailContent = z.infer<typeof contentSchema>;

/** Vista previa: admite borradores vacíos mientras se escribe. */
export const previewSchema = z.object({
  subject: z.string().max(200).default(''),
  preheader: z.string().max(200).optional(),
  html: z.string().max(200_000, 'El cuerpo es demasiado largo').default(''),
});
export const countSchema = z.object({ audience: audienceSchema });
export const campaignSchema = contentSchema.extend({ audience: audienceSchema });
