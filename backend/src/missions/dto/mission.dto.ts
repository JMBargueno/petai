import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Payload del evento de progreso emitido al cliente vía WebSocket. */
export class MissionProgressEvent {
  @ApiProperty({ description: 'ID de la misión' })
  missionId: string;

  @ApiProperty({ description: 'Progreso actual' })
  current: number;

  @ApiProperty({ description: 'Objetivo total' })
  target: number;
}

/** Payload del evento de misión completada emitido al cliente vía WebSocket. */
export class MissionCompletedEvent {
  @ApiProperty({ description: 'ID de la misión' })
  missionId: string;

  @ApiProperty({ description: 'Tipo de misión' })
  type: string;

  @ApiProperty({ description: 'Recompensa otorgada' })
  reward: { coins: number; gems: number; xp: number };

  @ApiProperty({ description: 'Misiones diarias completadas' })
  dailyCompleted: number;

  @ApiProperty({ description: 'Total de misiones diarias' })
  dailyTotal: number;
}

/** Evento de dominio: se emite cuando una acción incrementa el progreso de una misión. */
export class MissionProgressPayload {
  @ApiProperty({ description: 'ID del usuario' })
  userId: string;

  @ApiProperty({
    description: 'Tipo de acción (feed, battle, minigame, chat, clean, sleep, evolve, hatch)',
    example: 'feed',
  })
  actionType: string;

  @ApiPropertyOptional({ description: 'ID de la mascota (opcional)' })
  petId?: string;

  @ApiPropertyOptional({ description: 'Cantidad incrementada (default 1)' })
  amount?: number;
}