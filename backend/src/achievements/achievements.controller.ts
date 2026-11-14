import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AchievementsService } from './achievements.service';
import { ConstellationService } from './constellation.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { CurrentUser } from '../modules/auth/current-user.decorator';
import {
  AchievementListResponseDto,
  ClaimRewardResponseDto,
  ConstellationResponseDto,
} from './dto/achievement.dto';

@ApiTags('Achievements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('achievements')
export class AchievementsController {
  constructor(
    private readonly achievementsService: AchievementsService,
    private readonly constellationService: ConstellationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los logros del usuario con su estado' })
  @ApiResponse({ status: 200, description: 'Logros del usuario por categoría', type: AchievementListResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 500, description: 'Game-data de logros no cargado' })
  getAll(@CurrentUser() user: { id: string }) {
    return this.achievementsService.getAll(user.id);
  }

  @Get('constellation/:cat')
  @ApiOperation({ summary: 'Constelación (layout SVG + estado) de una categoría' })
  @ApiResponse({ status: 200, description: 'Constelación de la categoría', type: ConstellationResponseDto })
  @ApiResponse({ status: 400, description: 'Categoría inválida' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 500, description: 'Game-data de constelaciones no cargado' })
  getConstellation(@CurrentUser() user: { id: string }, @Param('cat') cat: string) {
    return this.constellationService.getConstellation(user.id, cat);
  }

  @Post(':id/claim')
  @ApiOperation({ summary: 'Reclamar el estado de recompensa de un logro desbloqueado' })
  @ApiResponse({ status: 200, description: 'Logro reclamado', type: ClaimRewardResponseDto })
  @ApiResponse({ status: 400, description: 'Logro no desbloqueado' })
  @ApiResponse({ status: 404, description: 'Logro no encontrado o no pertenece al usuario' })
  @ApiResponse({ status: 409, description: 'Logro ya reclamado (race condition)' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  claim(@CurrentUser() user: { id: string }, @Param('id') achId: string) {
    return this.achievementsService.claim(user.id, achId);
  }
}
