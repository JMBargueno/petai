import { Controller, Get, Patch, Post, Body, UseGuards, Param, Query, HttpCode, HttpStatus, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowUnverified } from '../auth/allow-unverified.decorator';
import { AchievementsService } from '../../achievements/achievements.service';
import { PublicAchievementsDto } from '../../achievements/dto/achievement.dto';
import { AchievementEngineService } from '../../achievements/achievement-engine.service';
import { StatsService } from '../../stats/stats.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Optional() private readonly achievementEngine?: AchievementEngineService,
    @Optional() private readonly stats?: StatsService,
  ) {}

  @Get()
  // Accesible sin verificar: las apps lo usan para saber si deben mostrar la pantalla de verificación.
  @AllowUnverified()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  async getMe(@CurrentUser() user: any) {
    const me = await this.usersService.getMe(user.id);
    // Abrir la app cuenta como día jugado (racha, también en clientes sin WebSocket; idempotente por
    // día) y evalúa con throttle los logros derivados (beta tester, días PRO, amigos...).
    void this.stats?.touchPlayDay(user.id, me.timezone).catch(() => undefined);
    void this.achievementEngine?.evaluateThrottled(user.id);
    return me;
  }

  @Post('handle')
  @HttpCode(HttpStatus.OK)
  // Accesible sin verificar ni nickname: es justo el paso que desbloquea la cuenta.
  @AllowUnverified()
  @ApiOperation({
    summary: 'Elegir el nickname (@handle) de una cuenta que aún no lo tiene',
    description: 'Solo se puede hacer una vez: el nickname es inmutable. 409 si ya está en uso o si la cuenta ya tenía uno.',
  })
  @ApiBody({ schema: { type: 'object', required: ['handle'], properties: { handle: { type: 'string', example: 'jmbargueno' } } } })
  @ApiResponse({ status: 200, description: 'Perfil actualizado (igual que GET /me)' })
  @ApiResponse({ status: 400, description: 'Formato no válido o nickname reservado' })
  @ApiResponse({ status: 409, description: 'Nickname en uso o ya fijado' })
  setHandle(@CurrentUser() user: any, @Body() body: { handle: string }) {
    return this.usersService.setHandle(user.id, body);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar preferencias del usuario (el nickname no se puede cambiar)' })
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
  constructor(
    private readonly achievementsService: AchievementsService,
    private readonly usersService: UsersService,
  ) {}

  @Get('by-handle/:handle')
  @ApiOperation({ summary: 'Perfil público mínimo de un jugador por su nickname (con o sin "@")' })
  @ApiResponse({ status: 200, description: '{ id, handle, displayName, title, accountXp }' })
  @ApiResponse({ status: 404, description: 'No hay ningún jugador con ese nickname' })
  getByHandle(@Param('handle') handle: string) {
    return this.usersService.findByHandle(handle);
  }

  @Get(':id/achievements')
  @ApiOperation({ summary: 'Logros públicos de un usuario (solo si ha activado la visibilidad)' })
  @ApiResponse({ status: 200, description: 'Perfil público de logros', type: PublicAchievementsDto })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  getPublicAchievements(@Param('id') userId: string, @Query('public') _public?: string) {
    return this.achievementsService.getPublicAchievements(userId);
  }
}

