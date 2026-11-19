import { z } from 'zod';
import { rewardsSchema } from './rewards.schemas';

/** Estados calculados de un voucher (se derivan de sus columnas, como las invitaciones). */
export const VOUCHER_STATUSES = ['active', 'used', 'revoked', 'expired'] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

/** Máximo de códigos aleatorios por petición. */
export const MAX_VOUCHERS_PER_REQUEST = 100;

/** Código personalizado: letras, números y guiones (se normaliza a mayúsculas sin espacios). */
export const CUSTOM_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{2,30})[A-Z0-9]$/;

export function normalizeVoucherCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

export const createVouchersSchema = z
  .object({
    code: z
      .string({ message: 'code debe ser un texto' })
      .transform(normalizeVoucherCode)
      .pipe(z.string().regex(CUSTOM_CODE_PATTERN, 'El código debe tener de 4 a 32 letras, números o guiones'))
      .optional(),
    count: z.coerce
      .number({ message: 'count debe ser un número' })
      .int('count debe ser un entero')
      .min(1, 'count debe ser al menos 1')
      .max(MAX_VOUCHERS_PER_REQUEST, `count no puede superar ${MAX_VOUCHERS_PER_REQUEST}`)
      .default(1),
    maxUses: z.coerce
      .number({ message: 'maxUses debe ser un número' })
      .int('maxUses debe ser un entero')
      .min(1, 'maxUses debe ser al menos 1')
      .max(1_000_000, 'maxUses no puede superar 1000000')
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
    rewards: rewardsSchema,
  })
  .refine((v) => !v.code || v.count === 1, { message: 'Un código personalizado se crea de uno en uno (count = 1)' });

export const listVouchersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(VOUCHER_STATUSES, { message: `status no válido (${VOUCHER_STATUSES.join(' | ')})` }).optional(),
});

export const redeemVoucherSchema = z.object({
  code: z
    .string({ message: 'Escribe un código' })
    .transform(normalizeVoucherCode)
    .pipe(z.string().min(1, 'Escribe un código').max(40, 'Código no válido')),
});
