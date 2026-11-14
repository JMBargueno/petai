import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReengagementService, ForgiveAction } from './reengagement.service';

/**
 * ReengagementController — Feature 028. "Welcome Back": estado, diario y ritual de perdón.
 */
@ApiTags('Reengagement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reengagement')
export class ReengagementController {
  constructor(private readonly reengagementService: ReengagementService) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado de la secuencia (tramo, plan, buff) para el pet activo' })
  @ApiResponse({ status: 200, description: 'Estado de re-engagement' })
  status(@CurrentUser() user: { id: string }) {
    return this.reengagementService.status(user.id);
  }

  @Get('diary')
  @ApiOperation({ summary: 'Diario de ausencia (3-5 viñetas con datos reales)' })
  @ApiResponse({ status: 200, description: 'Diario de ausencia' })
  diary(@CurrentUser() user: { id: string }) {
    return this.reengagementService.diary(user.id);
  }

  @Post('forgive')
  @ApiOperation({
    summary:
      'Completar el ritual de perdón del tramo → recovery buff 24h (+regalo en tier emocional)',
  })
  @ApiResponse({ status: 200, description: 'Ritual completado, buff aplicado' })
  @ApiResponse({ status: 400, description: 'Ritual incompleto / umbral no alcanzado' })
  @ApiResponse({ status: 409, description: 'Secuencia ya completada (anti-spam)' })
  @ApiBody({
    schema: {
      type: 'object',
      description: 'Datos del ritual de perdón (los tres son opcionales; basta con completar el umbral)',
      properties: {
        clicks: { type: 'integer', description: 'Clicks registrados en el ritual' },
        chat: { type: 'string', description: 'Mensaje de reconciliación' },
        actions: { type: 'array', items: { type: 'string' }, description: 'Acciones realizadas' },
      },
    },
  })
  forgive(@CurrentUser() user: { id: string }, @Body() action: ForgiveAction) {
    return this.reengagementService.forgive(user.id, action);
  }
}
