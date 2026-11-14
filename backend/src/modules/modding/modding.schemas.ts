import { z } from 'zod';

/**
 * S-10: esquemas zod de entrada para el workshop/modding (reutilizan el idiom de auth.schemas.ts).
 * `data`/sprites están acotados y `.strict()` rechaza campos sobrantes (`__proto__`, `constructor`…).
 * Las reglas de negocio (validación de `data` por tipo, sandbox, rate-limit) siguen en el service.
 */
const MOD_TYPES = ['species', 'furniture', 'minigame'] as const;
const MOD_RARITIES = ['common', 'rare', 'super_rare', 'legendary', 'mythic'] as const;

export const publishModSchema = z.object({
  type: z.enum(MOD_TYPES, { message: 'type de mod inválido' }),
  name: z.string().trim().min(1, 'name es obligatorio').max(80, 'name demasiado largo'),
  description: z.string().max(2000, 'description demasiado largo').default(''),
  element: z.string().max(32, 'element demasiado largo').optional(),
  rarity: z.enum(MOD_RARITIES, { message: 'rarity inválida' }).optional(),
  data: z.record(z.string(), z.unknown()).refine((d) => Object.keys(d).length > 0, 'data vacío'),
  sprite: z.string().max(512 * 1024, 'sprite demasiado grande (máx 512KB)').optional(),
  spriteUrl: z.string().max(512, 'spriteUrl demasiado largo').optional(),
  minigameCode: z.string().max(512 * 1024, 'minigameCode demasiado grande (máx 512KB)').optional(),
  minigameUrl: z.string().max(512, 'minigameUrl demasiado largo').optional(),
}).strict();

export const modRateSchema = z.object({
  stars: z.number().int('stars debe ser un entero').min(1, 'stars entre 1 y 5').max(5, 'stars entre 1 y 5'),
  rating: z.string().max(500, 'rating demasiado largo').optional(),
}).strict();

export const modReportSchema = z.object({
  reason: z.string().min(1, 'reason es obligatorio').max(200, 'reason demasiado largo'),
  details: z.string().max(2000, 'details demasiado largo').optional(),
}).strict();

export const downloadModSchema = z.object({
  petId: z.string().max(64, 'petId demasiado largo').optional(),
}).strict();

/** PATCH: cualquier subconjunto de campos, todos opcionales (sin defaults, para no sobrescribir). */
export const updateModSchema = z.object({
  name: z.string().trim().min(1, 'name inválido').max(80, 'name demasiado largo').optional(),
  description: z.string().max(2000, 'description demasiado largo').optional(),
  element: z.string().max(32, 'element demasiado largo').optional(),
  rarity: z.enum(MOD_RARITIES, { message: 'rarity inválida' }).optional(),
  data: z.record(z.string(), z.unknown()).refine((d) => Object.keys(d).length > 0, 'data vacío').optional(),
  sprite: z.string().max(512 * 1024, 'sprite demasiado grande (máx 512KB)').optional(),
  spriteUrl: z.string().max(512, 'spriteUrl demasiado largo').optional(),
  minigameUrl: z.string().max(512, 'minigameUrl demasiado largo').optional(),
});

export type PublishModInput = z.infer<typeof publishModSchema>;
export type UpdateModInput = z.infer<typeof updateModSchema>;