import { z } from 'zod';

/** S-10: validación de entrada de espectador (battleId no vacío). */
export const spectatorSubscribeSchema = z.object({ battleId: z.string().min(1, 'battleId es obligatorio') }).strict();

export type SpectatorSubscribeInput = z.infer<typeof spectatorSubscribeSchema>;