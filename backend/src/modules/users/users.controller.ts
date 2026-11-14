import { Controller, Get, Patch, Body, UseGuards, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AchievementsService } from '../../achievements/achievements.service';
import { PublicAchievementsDto } from '../../achievements/dto/achievement.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar preferencias del usuario' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        displayName: { type: 'string' },
        timezone: { type: 'string' },
        latitude: { type: 'number', nullable: true, description: 'Coordenada opt-in para el clima (se borra con null)' },
        longitude: { type: 'number', nullable: true, description: 'Coordenada opt-in para el clima (se borra con null)' },
        birthday: { type: 'string', nullable: true, description: 'Cumpleaños (YYYY-MM-DD)' },
        achievementsPublic: { type: 'boolean', description: 'Opt-in de visibilidad pública de logros' },
        notificationPrefs: {
          type: 'object',
          nullable: true,
          description:
            'Preferencias de notificaciones con personalidad (merge parcial). Campos: vitals_critical, interaction, achievement, arena, event (boolean) y maxPerDay (1-10).',
          properties: {
            vitals_critical: { type: 'boolean' },
            interaction: { type: 'boolean' },
            achievement: { type: 'boolean' },
            arena: { type: 'boolean' },
            event: { type: 'boolean' },
            maxPerDay: { type: 'integer', minimum: 1, maximum: 10 },
          },
        },
      },
    },
  })
  updateMe(
    @CurrentUser() user: any,
    @Body()
    body: {
      displayName?: string;
      timezone?: string;
      latitude?: number | null;
      longitude?: number | null;
      birthday?: string | null;
      achievementsPublic?: boolean;
      notificationPrefs?: {
        vitals_critical?: boolean;
        interaction?: boolean;
        achievement?: boolean;
        arena?: boolean;
        event?: boolean;
        maxPerDay?: number;
      } | null;
    },
  ) {
    return this.usersService.updateMe(user.id, body);
  }
}

/**
 * Perfil público (feature 008 / US5): `GET /users/:id/achievements?public=true`. Requiere JWT del
 * visitante (el dueño no necesita estar autenticado para sí mismo, pero la ruta sí exige auth).
 * Solo expone logros desbloqueados cuando el dueño ha activado `achievementsPublic`.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersAchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get(':id/achievements')
  @ApiOperation({ summary: 'Logros públicos de un usuario (solo si ha activado la visibilidad)' })
  @ApiResponse({ status: 200, description: 'Perfil público de logros', type: PublicAchievementsDto })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  getPublicAchievements(@Param('id') userId: string, @Query('public') _public?: string) {
    return this.achievementsService.getPublicAchievements(userId);
  }
}

