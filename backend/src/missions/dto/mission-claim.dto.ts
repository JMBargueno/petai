import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Recompensa de una misión. */
export class MissionRewardDto {
  @ApiProperty({ description: 'Monedas de recompensa', example: 15 })
  coins: number;

  @ApiProperty({ description: 'Gemas de recompensa', example: 0 })
  gems: number;

  @ApiProperty({ description: 'XP de recompensa', example: 10 })
  xp: number;
}

/** Una misión en la respuesta de `GET /missions`. */
export class MissionResponseDto {
  @ApiProperty({ description: 'ID de la misión (UUID)' })
  id: string;

  @ApiProperty({
    description: 'Tipo de acción',
    enum: ['feed', 'battle', 'minigame', 'chat', 'clean', 'sleep', 'evolve', 'hatch', 'level_up', 'battle_win', 'hatch_rare'],
    example: 'feed',
  })
  type: string;

  @ApiProperty({ description: 'Texto descriptivo para la UI', example: 'Alimenta a tu pet 2 veces' })
  description: string;

  @ApiProperty({ description: 'Objetivo total', example: 2 })
  target: number;

  @ApiProperty({ description: 'Progreso actual', example: 1 })
  current: number;

  @ApiProperty({ description: 'Si está completada', example: false })
  completed: boolean;

  @ApiProperty({ description: 'Recompensa', type: MissionRewardDto })
  reward: MissionRewardDto;

  @ApiProperty({ description: 'Fecha de reset (ISO 8601)', example: '2026-11-14T00:00:00.000Z' })
  resetsAt: string;
}

/** Respuesta de `GET /missions`. */
export class MissionListResponseDto {
  @ApiProperty({ description: 'Timestamp de la respuesta', example: '2026-11-13T14:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'Misiones diarias activas', type: [MissionResponseDto] })
  daily: MissionResponseDto[];

  @ApiProperty({ description: 'Misiones semanales activas', type: [MissionResponseDto] })
  weekly: MissionResponseDto[];

  @ApiProperty({ description: 'Si todas las diarias están completadas (desbloquea cofre)', example: false })
  dailyChestUnlocked: boolean;
}

/** Respuesta de `GET /missions/:id`. */
export class MissionDetailResponseDto {
  @ApiProperty({ description: 'ID de la misión (UUID)' })
  id: string;

  @ApiProperty({ description: 'Tipo de acción', example: 'feed' })
  type: string;

  @ApiProperty({ description: 'Período (daily o weekly)', example: 'daily' })
  period: string;

  @ApiProperty({ description: 'Texto descriptivo', example: 'Alimenta a tu pet 2 veces' })
  description: string;

  @ApiProperty({ description: 'Objetivo total', example: 2 })
  target: number;

  @ApiProperty({ description: 'Progreso actual', example: 1 })
  current: number;

  @ApiProperty({ description: 'Si está completada', example: false })
  completed: boolean;

  @ApiProperty({ description: 'Si la recompensa ya fue reclamada', example: false })
  claimed: boolean;

  @ApiProperty({ description: 'Recompensa', type: MissionRewardDto })
  reward: MissionRewardDto;

  @ApiProperty({ description: 'Inicio del período (ISO 8601)', example: '2026-11-13T00:00:00.000Z' })
  periodStart: string;

  @ApiProperty({ description: 'Fin del período (ISO 8601)', example: '2026-11-14T00:00:00.000Z' })
  periodEnd: string;

  @ApiProperty({ description: 'Fecha de creación de la misión (ISO 8601)', example: '2026-11-13T00:00:01.000Z' })
  createdAt: string;
}

/** Respuesta de `GET /missions/summary`. */
export class MissionSummaryResponseDto {
  @ApiProperty({ description: 'Misiones diarias completadas hoy', example: 3 })
  dailyCompleted: number;

  @ApiProperty({ description: 'Total de misiones diarias hoy', example: 4 })
  dailyTotal: number;

  @ApiProperty({ description: 'Misiones semanales completadas esta semana', example: 1 })
  weeklyCompleted: number;

  @ApiProperty({ description: 'Total de misiones semanales esta semana', example: 6 })
  weeklyTotal: number;

  @ApiProperty({ description: 'Racha de días consecutivos con todas las diarias completadas', example: 5 })
  streak: number;

  @ApiProperty({ description: 'Mejor racha histórica', example: 12 })
  bestStreak: number;
}

/** Misión simplificada en la respuesta de claim. */
export class ClaimedMissionDto {
  @ApiProperty({ description: 'ID de la misión' })
  id: string;

  @ApiProperty({ description: 'Tipo de misión', example: 'feed' })
  type: string;

  @ApiProperty({ description: 'Si está completada', example: true })
  completed: boolean;
}

/** Respuesta de `POST /missions/:id/claim`. */
export class ClaimRewardResponseDto {
  @ApiProperty({ description: 'Misión reclamada', type: ClaimedMissionDto })
  mission: ClaimedMissionDto;

  @ApiProperty({ description: 'Recompensa acreditada', type: MissionRewardDto })
  reward: MissionRewardDto;

  @ApiProperty({ description: 'Si todas las diarias están completadas (desbloquea cofre)', example: true })
  dailyChestUnlocked: boolean;
}
