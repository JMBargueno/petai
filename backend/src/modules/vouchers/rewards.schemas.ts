import { z } from 'zod';

/** Tipos de cofre que puede dar un voucher o un regalo del admin. */
export const REWARD_CHEST_TYPES = ['bronze', 'silver', 'gold', 'diamond', 'mythic'] as const;
export type RewardChestType = (typeof REWARD_CHEST_TYPES)[number];

/** Topes por recompensa: frenan errores al teclear (un cero de más) más que abusos. */
export const REWARD_LIMITS = {
  coins: 1_000_000,
  gems: 1_000_000,
  proDays: 365,
  chestQty: 10,
  accessories: 20,
  /** Consumibles (spec 41): líneas distintas por paquete y unidades por línea. */
  items: 10,
  itemQty: 99,
} as const;

const amount = (name: string, max: number) =>
  z.coerce
    .number({ message: `${name} debe ser un número` })
    .int(`${name} debe ser un entero`)
    .min(0, `${name} no puede ser negativo`)
    .max(max, `${name} no puede superar ${max}`)
    .default(0);

/**
 * Paquete de recompensas de un voucher o de un regalo directo. Se guarda tal cual en `Voucher.rewards`.
 * Las prendas se comprueban contra el catálogo en el servicio (aquí solo la forma).
 */
export const rewardsSchema = z
  .object({
    coins: amount('coins', REWARD_LIMITS.coins),
    gems: amount('gems', REWARD_LIMITS.gems),
    proDays: amount('proDays', REWARD_LIMITS.proDays),
    chests: z
      .array(
        z.object({
          type: z.enum(REWARD_CHEST_TYPES, { message: `tipo de cofre no válido (${REWARD_CHEST_TYPES.join(' | ')})` }),
          qty: z.coerce.number().int().min(1, 'qty debe ser al menos 1').max(REWARD_LIMITS.chestQty, `qty no puede superar ${REWARD_LIMITS.chestQty}`),
        }),
      )
      .default([])
      .transform(mergeChests),
    accessories: z
      .array(z.string().min(1).max(64))
      .max(REWARD_LIMITS.accessories, `como mucho ${REWARD_LIMITS.accessories} prendas`)
      .default([])
      .transform((ids) => [...new Set(ids)]),
    /** Consumibles de foods.json, también los de solo drop y los ocultos (spec 41). */
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          qty: z.coerce.number().int().min(1, 'qty debe ser al menos 1').max(REWARD_LIMITS.itemQty, `qty no puede superar ${REWARD_LIMITS.itemQty}`),
        }),
      )
      .max(REWARD_LIMITS.items, `como mucho ${REWARD_LIMITS.items} objetos distintos`)
      .default([])
      .transform(mergeItems),
  })
  .refine((r) => r.coins > 0 || r.gems > 0 || r.proDays > 0 || r.chests.length > 0 || r.accessories.length > 0 || r.items.length > 0, {
    message: 'El paquete debe incluir al menos una recompensa',
  });

export type Rewards = z.infer<typeof rewardsSchema>;

/** Une las líneas repetidas del mismo objeto (respetando el tope por línea). */
function mergeItems(lines: { id: string; qty: number }[]) {
  const byId = new Map<string, number>();
  for (const l of lines) byId.set(l.id, Math.min(REWARD_LIMITS.itemQty, (byId.get(l.id) ?? 0) + l.qty));
  return [...byId].map(([id, qty]) => ({ id, qty }));
}

/** Une las líneas repetidas del mismo tipo de cofre (respetando el tope por tipo). */
function mergeChests(lines: { type: RewardChestType; qty: number }[]) {
  const byType = new Map<RewardChestType, number>();
  for (const l of lines) byType.set(l.type, Math.min(REWARD_LIMITS.chestQty, (byType.get(l.type) ?? 0) + l.qty));
  return REWARD_CHEST_TYPES.filter((t) => byType.has(t)).map((type) => ({ type, qty: byType.get(type)! }));
}

export const grantSchema = z.object({
  rewards: rewardsSchema,
  note: z
    .string({ message: 'note debe ser un texto' })
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .pipe(z.string().max(200, 'note no puede superar los 200 caracteres'))
    .optional(),
});
