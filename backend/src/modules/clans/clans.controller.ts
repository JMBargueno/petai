import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ClansService, ClanSummary, ClanHabitat } from './clans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Clanes — endpoints para crear, unirse, salir e invitar en clanes, con XP compartida y presencia.
 *
 *   - POST  /v1/clans            → crear un clan (el actor es líder) { name, tag, description? }
 *   - GET   /v1/clans            → el clan del actor (o 404)
 *   - POST  /v1/clans/join       → unirse a un clan por su etiqueta { tag }
 *   - POST  /v1/clans/leave      → abandonar el propio clan
 *   - POST  /v1/clans/:id/invite → invitar a un usuario (Vigía+) { handle | userId }
 *   - GET   /v1/clans/:id/members → roster con presencia en línea
 *   - GET   /v1/clans/:id/habitat → hábitat del Nexo: nivel por XP + hasta 5 pockais activos
 *   - POST  /v1/clans/:id/messages → enviar mensaje al chat { body }
 *   - GET   /v1/clans/:id/messages?limit=&before= → historial reciente del chat
 *   - POST  /v1/clans/:id/goals → crear una meta { title, description?, metric, target }
 *   - GET   /v1/clans/:id/goals → lista de metas
 *   - POST  /v1/clans/:id/goals/:goalId/progress → avanzar una meta { amount }
 *   - DELETE /v1/clans/:id/goals/:goalId → eliminar una meta (Vigía+)
 *   - DELETE /v1/clans/:id/messages/:messageId → borrar un mensaje (autor o Vigía+)
 *   - DELETE /v1/clans/:id/members/:userId → expulsar (Vigía+, solo rangos inferiores)
 *   - PATCH /v1/clans/:id/members/:userId/role → cambiar rango { role } (Guardián+)
 *   - POST  /v1/clans/:id/transfer → ceder la Forja { userId } (Forjador)
 *   - PATCH /v1/clans/:id → editar nombre/descripción (Guardián+)
 *   - DELETE /v1/clans/:id → disolver el clan (Forjador)
 *
 * Rangos (lore: Nexo de Resonancia): creator (Forjador) > admin (Guardián) > moderator (Vigía) > member (Hermano).
 */
@ApiTags('Clans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clans')
export class ClansController {
  constructor(private readonly clansService: ClansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un clan (el actor se convierte en Forjador)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'tag'],
      properties: {
        name: { type: 'string' },
        tag: { type: 'string' },
        description: { type: 'string', description: 'Opcional' },
      },
    },
  })
  create(
    @CurrentUser() user: any,
    @Body() body: { name?: string; tag?: string; description?: string },
  ): Promise<ClanSummary> {
    return this.clansService.createClan(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'Mi clan (o 404 si no perteneces a ninguno)' })
  getMine(@CurrentUser() user: any): Promise<ClanSummary> {
    return this.clansService.getMyClan(user.id);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unirse a un clan existente por su etiqueta (tag)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tag'],
      properties: { tag: { type: 'string' } },
    },
  })
  join(@CurrentUser() user: any, @Body() body: { tag?: string }): Promise<ClanSummary> {
    return this.clansService.joinClan(user.id, body);
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abandonar mi clan' })
  leave(@CurrentUser() user: any): Promise<{ success: boolean; message: string }> {
    return this.clansService.leaveClan(user.id);
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invitar a un usuario a unirse directamente (Vigía o superior)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        handle: { type: 'string', example: 'jmbargueno', description: 'Nickname del invitado (con o sin "@")' },
        userId: { type: 'string', description: 'Alternativa a handle: ID del usuario invitado' },
      },
    },
  })
  invite(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Body() body: { userId?: string; handle?: string; email?: string },
  ): Promise<ClanSummary> {
    return this.clansService.inviteMember(user.id, clanId, body);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Roster del clan con presencia en línea por miembro' })
  getMembers(@CurrentUser() user: any, @Param('id') clanId: string): Promise<ClanSummary> {
    return this.clansService.getMembers(user.id, clanId);
  }

  @Get(':id/habitat')
  @ApiOperation({
    summary:
      'Hábitat del Nexo: nivel visual por XP y hasta 5 pockais activos (uno por miembro, el tuyo siempre), sorteados en cada llamada',
  })
  getHabitat(@CurrentUser() user: any, @Param('id') clanId: string): Promise<ClanHabitat> {
    return this.clansService.getHabitat(user.id, clanId);
  }

  // ── Gestión del Nexo (rangos) ───────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({ summary: 'Editar nombre y/o descripción del clan (Guardián o superior)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Máx. 40 caracteres' },
        description: { type: 'string', nullable: true, description: 'Máx. 300 caracteres; vacío o null la borra' },
      },
    },
  })
  update(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Body() body: { name?: string; description?: string | null },
  ): Promise<ClanSummary> {
    return this.clansService.updateClan(user.id, clanId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disolver el clan (solo el Forjador)' })
  disband(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.clansService.disbandClan(user.id, clanId);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Expulsar a un miembro de rango inferior (Vigía o superior)' })
  kick(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Param('userId') targetUserId: string,
  ): Promise<ClanSummary> {
    return this.clansService.kickMember(user.id, clanId, targetUserId);
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({ summary: 'Cambiar el rango de un miembro (Guardián o superior; Guardianes solo el Forjador)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['role'],
      properties: { role: { type: 'string', enum: ['admin', 'moderator', 'member'] } },
    },
  })
  setRole(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role?: string },
  ): Promise<ClanSummary> {
    return this.clansService.setMemberRole(user.id, clanId, targetUserId, body?.role);
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ceder la Forja (rango de creador) a otro miembro (solo el Forjador)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      properties: { userId: { type: 'string', description: 'ID del nuevo Forjador' } },
    },
  })
  transfer(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Body() body: { userId?: string },
  ): Promise<ClanSummary> {
    return this.clansService.transferCreator(user.id, clanId, body?.userId);
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enviar un mensaje al chat del clan' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['body'],
      properties: { body: { type: 'string', description: 'Texto (máx. 500 caracteres)' } },
    },
  })
  sendMessage(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Body() body: { body?: string },
  ) {
    return this.clansService.sendMessage(user.id, clanId, body?.body);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Historial reciente del chat del clan (más reciente primero)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máx. 50 (por defecto 20)' })
  @ApiQuery({ name: 'before', required: false, type: String, description: 'Cursor ISO datetime: anteriores a esta fecha' })
  getMessages(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.clansService.getMessages(user.id, clanId, {
      limit: limit ? Number(limit) : undefined,
      before,
    });
  }

  @Delete(':id/messages/:messageId')
  @ApiOperation({ summary: 'Borrar un mensaje del chat (su autor o un Vigía o superior)' })
  deleteMessage(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.clansService.deleteMessage(user.id, clanId, messageId);
  }

  // ── Metas / objetivos ───────────────────────────────────────────────────────

  @Post(':id/goals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una meta compartida del clan' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'target'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string', description: 'Opcional' },
        metric: { type: 'string', description: 'xp | visits | generic (por defecto generic)' },
        target: { type: 'number', description: 'Objetivo (> 0)' },
      },
    },
  })
  createGoal(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Body() body: { title?: string; description?: string; metric?: string; target?: number },
  ) {
    return this.clansService.createGoal(user.id, clanId, body);
  }

  @Get(':id/goals')
  @ApiOperation({ summary: 'Lista de metas del clan (activas primero, progreso desc)' })
  getGoals(@CurrentUser() user: any, @Param('id') clanId: string) {
    return this.clansService.getGoals(user.id, clanId);
  }

  @Post(':id/goals/:goalId/progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aumentar el progreso de una meta del clan' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount'],
      properties: { amount: { type: 'number', description: 'Cantidad a sumar al progreso' } },
    },
  })
  addGoalProgress(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Param('goalId') goalId: string,
    @Body() body: { amount?: number },
  ) {
    return this.clansService.addGoalProgress(user.id, clanId, goalId, body?.amount ?? 0);
  }

  @Delete(':id/goals/:goalId')
  @ApiOperation({ summary: 'Eliminar una meta del clan (Vigía o superior)' })
  deleteGoal(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.clansService.deleteGoal(user.id, clanId, goalId);
  }
}
