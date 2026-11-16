import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { HabitatVisitService, ActiveVisitor } from './habitat-visit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Visita en vivo del habitat — el pet del visitante aparece en el habitat del dueño en tiempo real.
 *
 *   - POST /v1/habitat/visit       → iniciar visita { ownerId } (exige amistad aceptada)
 *   - POST /v1/habitat/visit/end   → terminar mi visita activa
 *   - GET  /v1/habitat/visitors    → visitas activas donde el actor es el dueño
 */
@ApiTags('Habitat · Visita en vivo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('habitat')
export class HabitatVisitController {
  constructor(private readonly habitatVisitService: HabitatVisitService) {}

  @Post('visit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar una visita en vivo al habitat de un amigo' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['ownerId'],
      properties: { ownerId: { type: 'string', description: 'Dueño del habitat visitado' } },
    },
  })
  start(
    @CurrentUser() user: any,
    @Body() body: { ownerId?: string },
  ): Promise<{ success: boolean; visit: ActiveVisitor }> {
    return this.habitatVisitService.startVisit(user.id, body?.ownerId);
  }

  @Post('visit/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar mi visita en vivo activa' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { ownerId: { type: 'string', description: 'Opcional: limitar a un dueño' } },
    },
  })
  end(@CurrentUser() user: any, @Body() body: { ownerId?: string }): Promise<{ success: boolean; ended: number }> {
    return this.habitatVisitService.endVisit(user.id, body?.ownerId);
  }

  @Get('visitors')
  @ApiOperation({ summary: 'Visitas activas donde el actor es el dueño del habitat' })
  list(@CurrentUser() user: any): Promise<{ visitors: ActiveVisitor[] }> {
    return this.habitatVisitService.listVisitors(user.id);
  }
}
