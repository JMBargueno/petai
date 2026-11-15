import { z } from 'zod';

const MAX_PRICE = 1_000_000;
const price = z.number().int('El precio debe ser un entero').min(0, 'El precio no puede ser negativo').max(MAX_PRICE);

export const updateItemPriceSchema = z
  .object({ priceCoins: price.optional(), priceGems: price.optional() })
  .strict()
  .refine((v) => v.priceCoins !== undefined || v.priceGems !== undefined, { message: 'Indica priceCoins o priceGems' });

export const bulkPriceSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1, 'Selecciona al menos un objeto').max(500),
  percent: z.number().int().min(-90).max(500),
  currency: z.enum(['priceCoins', 'priceGems']),
});

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const listPetsSchema = z.object({
  page,
  pageSize,
  q: z.string().trim().max(100).optional(),
  speciesId: z.string().trim().max(64).optional(),
  rarity: z.string().trim().max(32).optional(),
});

export const listAuditSchema = z.object({
  page,
  pageSize,
  event: z.string().trim().max(64).optional(),
  userId: z.string().uuid().optional(),
});
