import { z } from 'zod';

/** S-10: validación del push de sync. Acorde con `SyncAction` y `MAX_ACTIONS_PER_PUSH` (500). */
const SYNC_ACTION_TYPES = ['feed', 'play', 'clean', 'sleep', 'wake', 'chat', 'battle', 'evolve'] as const;
const MAX_ACTIONS_PER_PUSH = 500;

export const syncPushSchema = z
  .object({
    actions: z
      .array(
        z.object({
          id: z.string().min(1),
          petId: z.string().min(1),
          type: z.enum(SYNC_ACTION_TYPES, { message: 'type de acción inválido' }),
          args: z.record(z.string(), z.unknown()),
          timestamp: z.number(),
        }),
      )
      .min(1, 'actions debe tener al menos un elemento')
      .max(MAX_ACTIONS_PER_PUSH, `máximo ${MAX_ACTIONS_PER_PUSH} acciones por push`),
  })
  .strict();

export type SyncPushInput = z.infer<typeof syncPushSchema>;