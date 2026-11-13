import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BattlesService } from './battles.service';

@ApiTags('Battles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BattlesController {
  constructor(private readonly battles: BattlesService) {}

  // ---------- Perfil de combate de la mascota ----------

  @Get('pets/:id/combat')
  @ApiOperation({ summary: 'Estadísticas de combate, habilidades, ELO, liga y límites diarios' })
  profile(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.battles.combatProfile(user.id, petId);
  }

  @Post('pets/:id/combat/stats')
  @ApiOperation({ summary: 'Repartir puntos de estadística (HP, ATK, DEF, VEL, ESP)' })
  allocate(@CurrentUser() user: any, @Param('id') petId: string, @Body() body: unknown) {
    return this.battles.allocateStats(user.id, petId, body);
  }

  @Put('pets/:id/combat/skills')
  @ApiOperation({ summary: 'Equipar hasta 4 habilidades' })
  equip(@CurrentUser() user: any, @Param('id') petId: string, @Body() body: { skills?: unknown } | undefined) {
    return this.battles.equipSkills(user.id, petId, body?.skills);
  }

  // ---------- Peleas ----------

  @Post('battles/matchmake')
  @ApiOperation({ summary: 'Buscar rival por ELO, simular el combate determinista y devolver la repetición' })
  matchmake(@CurrentUser() user: any, @Body() body: { petId?: string } | undefined) {
    return this.battles.matchmake(user.id, body?.petId as string);
  }

  @Get('battles')
  @ApiOperation({ summary: 'Historial de peleas del usuario (como atacante y como defensor)' })
  history(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.battles.history(user.id, limit ? Number(limit) : undefined);
  }

  @Get('battles/:id')
  @ApiOperation({ summary: 'Detalle y repetición de una pelea (solo participantes)' })
  battle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.battles.getBattle(user.id, id);
  }

  // ---------- Clasificación ----------

  @Get('leaderboard')
  @ApiOperation({ summary: 'Clasificación global (ELO) o semanal (puntos de liga)' })
  leaderboard(
    @CurrentUser() user: any,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
    @Query('petId') petId?: string,
  ) {
    return this.battles.leaderboardView(user.id, (scope ?? 'global') as any, limit ? Number(limit) : 20, petId);
  }

  @Get('arena/leagues')
  @ApiOperation({ summary: 'Ligas, límites y recompensas de la arena' })
  leagues() {
    return this.battles.leagues();
  }
}
