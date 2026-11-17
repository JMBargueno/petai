import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACHIEVEMENT_CATEGORY_VALUES, ACHIEVEMENT_TIER_VALUES } from '../../achievements/dto/achievement.dto';

/** Insignia (logro desbloqueado) mostrada en un perfil. */
export class ProfileBadgeDto {
  @ApiProperty({ description: 'ID lógico del logro', example: 'special_beta_tester' })
  id: string;

  @ApiProperty({ example: 'Beta Tester' })
  name: string;

  @ApiProperty({ example: 'Te uniste a PockAI antes de 2027' })
  description: string;

  @ApiProperty({ description: 'Icono lucide (kebab-case) de la insignia', example: 'flask-conical' })
  badgeIcon: string;

  @ApiProperty({ enum: ACHIEVEMENT_CATEGORY_VALUES, example: 'special' })
  category: string;

  @ApiProperty({ enum: ACHIEVEMENT_TIER_VALUES, example: 'legendary' })
  tier: string;

  @ApiProperty({ description: 'Fecha de desbloqueo (ISO 8601)', example: '2026-11-17T10:00:00.000Z' })
  unlockedAt: string;
}

/** Mascota principal mostrada en el perfil. */
export class ProfilePetDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Chispa' }) nickname: string;
  @ApiProperty({ example: 'Flamín' }) speciesName: string;
  @ApiProperty({ example: 'fire' }) element: string;
  @ApiProperty({ example: 'rare' }) rarity: string;
  @ApiProperty({ example: 12 }) level: number;
  @ApiProperty({ example: 'juvenile' }) stage: string;
  @ApiProperty({ example: false }) shiny: boolean;
}

/** Estadísticas del perfil (en el perfil público solo se envían si el dueño las muestra). */
export class ProfileStatsDto {
  @ApiProperty({ description: 'Minutos de juego', example: 754 }) playMinutes: number;
  @ApiProperty({ description: 'Veces que ha alimentado a sus mascotas', example: 132 }) feeds: number;
  @ApiProperty({ example: 40 }) cleans: number;
  @ApiProperty({ example: 25 }) sleeps: number;
  @ApiProperty({ description: 'Huevos abiertos', example: 6 }) eggsHatched: number;
  @ApiProperty({ description: 'Pockais por rareza', example: { normal: 4, rare: 2 } }) byRarity: Record<string, number>;
  @ApiProperty({ description: 'Pockais shiny conseguidos', example: 0 }) shinies: number;
  @ApiProperty({ description: 'Visitas a hábitats de amigos', example: 9 }) habitatVisits: number;
  @ApiProperty({ description: 'Amigos aceptados', example: 3 }) friends: number;
  @ApiProperty({ description: 'Racha actual de días seguidos', example: 4 }) streakCurrent: number;
  @ApiProperty({ description: 'Mejor racha de días seguidos', example: 12 }) streakBest: number;
  @ApiProperty({ description: 'Días siendo PRO', example: 45 }) proDays: number;
  @ApiPropertyOptional({ description: 'Monedas gastadas (solo en el perfil propio)', example: 3400 }) coinsSpent?: number;
  @ApiPropertyOptional({ description: 'Gemas gastadas (solo en el perfil propio)', example: 20 }) gemsSpent?: number;
}

class ProfileAchievementCountDto {
  @ApiProperty({ example: 14 }) unlocked: number;
  @ApiProperty({ example: 78 }) total: number;
}

/** Datos comunes del perfil propio y del público. */
export class ProfileBaseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Jose' }) displayName: string;
  @ApiPropertyOptional({ nullable: true, example: 'jose' }) handle: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Cuidador novato' }) title: string | null;
  @ApiProperty({ example: 1200 }) accountXp: number;
  @ApiProperty({ description: 'Fecha de alta (ISO 8601)' }) createdAt: string;
  @ApiProperty({ description: 'Si ahora mismo es PRO' }) isPro: boolean;
  @ApiProperty({ description: 'Si el dueño muestra sus insignias y estadísticas' }) achievementsPublic: boolean;
  @ApiPropertyOptional({ type: ProfilePetDto, nullable: true }) pet: ProfilePetDto | null;
  @ApiPropertyOptional({ type: ProfileStatsDto, nullable: true, description: 'null si el dueño las oculta' }) stats: ProfileStatsDto | null;
  @ApiProperty({ type: [ProfileBadgeDto], description: 'Insignias desbloqueadas (vacío si las oculta)' }) badges: ProfileBadgeDto[];
  @ApiProperty({ type: [String], description: 'Ids de las insignias destacadas (máx. 3)' }) featuredBadges: string[];
  @ApiProperty({ type: ProfileAchievementCountDto }) achievementCount: ProfileAchievementCountDto;
}

/** `GET /me/profile`. */
export class MyProfileDto extends ProfileBaseDto {
  @ApiPropertyOptional({ nullable: true, description: 'Inicio del tramo PRO actual (ISO 8601)' }) proSince: string | null;
}

/** `GET /users/:id/profile`. */
export class PublicProfileDto extends ProfileBaseDto {
  @ApiProperty({ description: 'Si el visitante y el dueño son amigos' }) isFriend: boolean;
  @ApiProperty({ description: 'Si es el perfil del propio visitante' }) isSelf: boolean;
}

/** Cuerpo de `PUT /me/featured-badges`. */
export class SetFeaturedBadgesDto {
  @ApiProperty({ type: [String], maxItems: 3, example: ['special_beta_tester', 'care_feed_50'] })
  achIds: string[];
}
