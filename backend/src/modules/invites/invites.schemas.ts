import { z } from 'zod';

/** Estados calculados de un código de invitación (no se guardan: se derivan de sus columnas). */
export const INVITE_STATUSES = ['active', 'used', 'revoked', 'expired'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Máximo de códigos que se generan en una sola petición. */
export const MAX_INVITES_PER_REQUEST = 50;

export const createInvitesSchema = z.object({
  maxUses: z.coerce
    .number({ message: 'maxUses debe ser un número' })
    .int('maxUses debe ser un entero')
    .min(1, 'maxUses debe ser al menos 1')
    .max(10_000, 'maxUses no puede superar 10000')
    .default(1),
  expiresAt: z
    .union([z.null(), z.coerce.date({ message: 'expiresAt no es una fecha válida' })])
    .optional()
    .refine((d) => !d || d.getTime() > Date.now(), 'expiresAt debe ser una fecha futura'),
  note: z
    .string({ message: 'note debe ser un texto' })
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .pipe(z.string().max(200, 'note no puede superar los 200 caracteres'))
    .optional(),
  count: z.coerce
    .number({ message: 'count debe ser un número' })
    .int('count debe ser un entero')
    .min(1, 'count debe ser al menos 1')
    .max(MAX_INVITES_PER_REQUEST, `count no puede superar ${MAX_INVITES_PER_REQUEST}`)
    .default(1),
});

export const listInvitesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(INVITE_STATUSES, { message: `status no válido (${INVITE_STATUSES.join(' | ')})` }).optional(),
});

export const registrationSettingsSchema = z.object({
  inviteOnly: z.boolean({ message: 'inviteOnly debe ser true o false' }),
});
