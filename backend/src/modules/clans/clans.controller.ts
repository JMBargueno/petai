import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ClansService, ClanSummary } from './clans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Clanes — endpoints para crear, unirse, salir e invitar en clanes, con XP compartida y presencia.
 *
 *   - POST  /v1/clans            → crear un clan (el actor es líder) { name, tag, description? }
 *   - GET   /v1/clans            → el clan del actor (o 404)
 *   - POST  /v1/clans/join       → unirse a un clan por su etiqueta { tag }
 *   - POST  /v1/clans/leave      → abandonar el propio clan
 *   - POST  /v1/clans/:id/invite → invitar a un usuario (solo el líder) { userId | email }
 *   - GET   /v1/clans/:id/members → roster con presencia en línea
 *   - POST  /v1/clans/:id/messages → enviar mensaje al chat { body }
 *   - GET   /v1/clans/:id/messages?limit=&before= → historial reciente del chat
 *   - POST  /v1/clans/:id/goals → crear una meta { title, description?, metric, target }
 *   - GET   /v1/clans/:id/goals → lista de metas
 *   - POST  /v1/clans/:id/goals/:goalId/progress → avanzar una meta { amount }
 *   - DELETE /v1/clans/:id/goals/:goalId → eliminar una meta (solo el líder)
 */
@ApiTags('Clans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clans')
export class ClansController {
  constructor(private readonly clansService: ClansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un clan (el actor se convierte en líder)' })
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
  @ApiOperation({ summary: 'Invitar a un usuario a unirse directamente (solo el líder)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID del usuario invitado' },
        email: { type: 'string', description: 'Alternativa a userId: email del invitado' },
      },
    },
  })
  invite(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Body() body: { userId?: string; email?: string },
  ): Promise<ClanSummary> {
    return this.clansService.inviteMember(user.id, clanId, body);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Roster del clan con presencia en línea por miembro' })
  getMembers(@Param('id') clanId: string): Promise<ClanSummary> {
    return this.clansService.getMembers(clanId);
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
  @ApiOperation({ summary: 'Eliminar una meta del clan (solo el líder)' })
  deleteGoal(
    @CurrentUser() user: any,
    @Param('id') clanId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.clansService.deleteGoal(user.id, clanId, goalId);
  }
}
