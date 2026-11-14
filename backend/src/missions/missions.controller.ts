import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { MissionsService } from './missions.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { CurrentUser } from '../modules/auth/current-user.decorator';
import {
  MissionListResponseDto,
  MissionDetailResponseDto,
  MissionSummaryResponseDto,
  ClaimRewardResponseDto,
} from './dto/mission-claim.dto';

@ApiTags('Missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('missions')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener misiones activas del usuario (diarias + semanales)' })
  @ApiResponse({ status: 200, description: 'Misiones del usuario', type: MissionListResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  getMissions(@CurrentUser() user: { id: string; timezone: string }) {
    return this.missionsService.getMissions(user.id, user.timezone);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumen de progreso y streaks de misiones' })
  @ApiResponse({ status: 200, description: 'Resumen de misiones', type: MissionSummaryResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  getSummary(@CurrentUser() user: { id: string; timezone: string }) {
    return this.missionsService.getSummary(user.id, user.timezone);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una misión específica' })
  @ApiResponse({ status: 200, description: 'Detalle de la misión', type: MissionDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Misión no encontrada' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  getMissionById(@CurrentUser() user: { id: string; timezone: string }, @Param('id') missionId: string) {
    return this.missionsService.getMissionById(user.id, missionId);
  }

  @Post(':id/claim')
  @ApiOperation({ summary: 'Reclamar la recompensa de una misión completada' })
  @ApiResponse({ status: 200, description: 'Recompensa reclamada', type: ClaimRewardResponseDto })
  @ApiResponse({ status: 400, description: 'Misión no completada' })
  @ApiResponse({ status: 404, description: 'Misión no encontrada' })
  @ApiResponse({ status: 409, description: 'Misión ya reclamada' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  claimReward(@CurrentUser() user: { id: string; timezone: string }, @Param('id') missionId: string) {
    return this.missionsService.claimReward(user.id, missionId);
  }
}
