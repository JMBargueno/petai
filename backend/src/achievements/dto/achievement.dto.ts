import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Categorías/constelaciones de logros. */
export const ACHIEVEMENT_CATEGORY_VALUES = ['care', 'battle', 'ai', 'collection', 'social'] as const;
/** Tiers de logro. */
export const ACHIEVEMENT_TIER_VALUES = ['common', 'rare', 'epic', 'legendary'] as const;
/** Estado derivado de un logro. */
export const ACHIEVEMENT_STATUS_VALUES = ['locked', 'in_progress', 'unlocked'] as const;

/** Recompensa de un logro. */
export class AchievementRewardDto {
  @ApiProperty({ description: 'Monedas de recompensa', example: 100 })
  coins: number;

  @ApiProperty({ description: 'Gemas de recompensa', example: 0 })
  gems: number;

  @ApiProperty({ description: 'XP de recompensa', example: 40 })
  xp: number;

  @ApiPropertyOptional({ description: 'Item exclusivo (solo epic/legendary)', nullable: true, example: null })
  itemId: string | null;
}

/** Un logro con su estado (usado en `GET /achievements` y en las constelaciones). */
export class AchievementDto {
  @ApiProperty({ description: 'ID lógico del logro', example: 'care_feed_50' })
  id: string;

  @ApiProperty({ description: 'Categoría/constelación', enum: ACHIEVEMENT_CATEGORY_VALUES, example: 'care' })
  category: string;

  @ApiProperty({ description: 'Nombre corto para la UI', example: 'Alimentación constante' })
  name: string;

  @ApiProperty({ description: 'Texto descriptivo', example: 'Alimenta a tu pet 50 veces' })
  description: string;

  @ApiProperty({ description: 'Tier', enum: ACHIEVEMENT_TIER_VALUES, example: 'common' })
  tier: string;

  @ApiProperty({ description: 'Objetivo total', example: 50 })
  target: number;

  @ApiProperty({ description: 'Progreso actual', example: 12 })
  current: number;

  @ApiProperty({ description: 'Estado derivado', enum: ACHIEVEMENT_STATUS_VALUES, example: 'in_progress' })
  status: string;

  @ApiPropertyOptional({ description: 'Fecha de desbloqueo (ISO 8601)', nullable: true, example: null })
  unlockedAt: string | null;

  @ApiProperty({ description: 'Si la recompensa fue reclamada', example: false })
  claimed: boolean;

  @ApiProperty({ description: 'Recompensa', type: AchievementRewardDto })
  reward: AchievementRewardDto;
}

/** Respuesta de `GET /achievements`. */
export class AchievementListResponseDto {
  @ApiProperty({ description: 'Timestamp de la respuesta (ISO 8601)', example: '2026-11-13T14:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'Estado del opt-in de visibilidad pública', example: false })
  achievementsPublic: boolean;

  @ApiProperty({ description: 'Logros por categoría (5: care, battle, ai, collection, social)' } as any)
  categories: Record<string, AchievementDto[]>;
}

/** Estrella de una constelación (una entrada del layout con su estado). */
export class StarDto {
  @ApiProperty({ description: 'ID lógico del logro', example: 'battle_10_wins' })
  id: string;

  @ApiProperty({ description: 'Coordenada X normalizada [0,1]', example: 0.45 })
  x: number;

  @ApiProperty({ description: 'Coordenada Y normalizada [0,1]', example: 0.45 })
  y: number;

  @ApiProperty({ description: 'Estado del logro', enum: ACHIEVEMENT_STATUS_VALUES, example: 'unlocked' })
  status: string;

  @ApiProperty({ description: 'Nombre del logro', example: 'Guerrero' })
  name: string;

  @ApiProperty({ description: 'Tier del logro', enum: ACHIEVEMENT_TIER_VALUES, example: 'rare' })
  tier: string;
}

/** Respuesta de `GET /achievements/constellation/:cat`. */
export class ConstellationResponseDto {
  @ApiProperty({ description: 'Categoría/constelación', enum: ACHIEVEMENT_CATEGORY_VALUES, example: 'battle' })
  category: string;

  @ApiProperty({ description: 'Nombre de la constelación', example: 'Batalla' })
  name: string;

  @ApiProperty({ description: 'Estrellas de la constelación', type: [StarDto] })
  stars: StarDto[];

  @ApiProperty({ description: 'Conexiones entre estrellas (pares de ids)', example: [['battle_5_fights', 'battle_1_wins']] })
  connections: [string, string][];
}

/** Logro simplificado en la respuesta de claim. */
export class ClaimedAchievementDto {
  @ApiProperty({ description: 'ID lógico del logro', example: 'battle_10_wins' })
  id: string;

  @ApiProperty({ description: 'Categoría', example: 'battle' })
  category: string;

  @ApiProperty({ description: 'Si fue reclamado', example: true })
  claimed: boolean;
}

/** Respuesta de `POST /achievements/:id/claim`. */
export class ClaimRewardResponseDto {
  @ApiProperty({ description: 'Logro reclamado', type: ClaimedAchievementDto })
  achievement: ClaimedAchievementDto;

  @ApiProperty({ description: 'Recompensa acreditada', type: AchievementRewardDto })
  reward: AchievementRewardDto;
}

/** Logro desbloqueado expuesto en el perfil público (sin `current` ni progreso no desbloqueado). */
export class PublicAchievementDto {
  @ApiProperty({ description: 'ID lógico del logro', example: 'battle_10_wins' })
  id: string;

  @ApiProperty({ description: 'Nombre', example: 'Guerrero' })
  name: string;

  @ApiProperty({ description: 'Categoría', enum: ACHIEVEMENT_CATEGORY_VALUES, example: 'battle' })
  category: string;

  @ApiProperty({ description: 'Tier', enum: ACHIEVEMENT_TIER_VALUES, example: 'rare' })
  tier: string;

  @ApiProperty({ description: 'Fecha de desbloqueo (ISO 8601)', example: '2026-11-10T09:15:00.000Z' })
  unlockedAt: string;

  @ApiProperty({ description: 'Recompensa', type: AchievementRewardDto })
  reward: AchievementRewardDto;
}

/** Respuesta del perfil público de logros. */
export class PublicAchievementsDto {
  @ApiProperty({ description: 'ID del usuario dueño', example: 'u-123' })
  userId: string;

  @ApiProperty({ description: 'Nombre visible del dueño', nullable: true, example: 'Felpa' })
  displayName: string | null;

  @ApiProperty({ description: 'Si el dueño ha activado la visibilidad pública', example: true })
  achievementsPublic: boolean;

  @ApiProperty({ description: 'Solo logros desbloqueados (sin progreso no desbloqueado)', type: [PublicAchievementDto] })
  achievements: PublicAchievementDto[];
}
