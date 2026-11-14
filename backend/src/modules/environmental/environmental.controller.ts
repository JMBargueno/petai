import { BadRequestException, Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EnvironmentalService } from './environmental.service';
import { ActivityHeartbeatDto } from './dto/activity-heartbeat.dto';
import { EnvironmentalStatusModel, UpcomingFestivalModel } from './dto/environmental.response';

@ApiTags('Environmental')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('environmental')
export class EnvironmentalController {
  constructor(private readonly environmental: EnvironmentalService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Estado ambiental del usuario (hora del día, clima, actividad, festividad)',
  })
  @ApiOkResponse({ type: EnvironmentalStatusModel })
  getStatus(@CurrentUser() user: any): Promise<EnvironmentalStatusModel> {
    return this.environmental.getStatus(user.id);
  }

  @Post('activity')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Heartbeat del escritorio para detectar actividad/inactividad del PC',
  })
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean', example: true } } } })
  async postActivity(
    @CurrentUser() user: any,
    @Body() body: ActivityHeartbeatDto,
  ): Promise<{ ok: true }> {
    this.validateHeartbeat(body);
    return this.environmental.recordActivity(user.id, body ?? {});
  }

  @Get('festivals/upcoming')
  @ApiOperation({ summary: 'Festividades próximas (incluida la de hoy), con días restantes' })
  @ApiOkResponse({ type: [UpcomingFestivalModel] })
  getUpcomingFestivals(@CurrentUser() user: any): Promise<UpcomingFestivalModel[]> {
    return this.environmental.getUpcomingFestivals(user.id);
  }

  /**
   * Valida/normaliza el heartbeat: `active` debe ser booleano y `cpuUsage` (opcional) un número
   * finito ≥ 0. Si no, responde 400 (contrato de errores).
   */
  private validateHeartbeat(body: ActivityHeartbeatDto): void {
    const input = body ?? {};
    if (input.active !== undefined && typeof input.active !== 'boolean') {
      throw new BadRequestException('active debe ser un booleano');
    }
    if (
      input.cpuUsage !== undefined &&
      (typeof input.cpuUsage !== 'number' || !Number.isFinite(input.cpuUsage) || input.cpuUsage < 0)
    ) {
      throw new BadRequestException('cpuUsage debe ser un número ≥ 0');
    }
  }
}

