import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { HabitatVisitService, ActiveVisitor, VisitRoom } from './habitat-visit.service';
import { VisitDialogService, VisitInteraction } from './visit-dialog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Visita en vivo del habitat — el pet del visitante aparece en el habitat del dueño en tiempo real.
 *
 *   - POST /v1/habitat/visit       → iniciar visita { ownerId } (exige amistad aceptada)
 *   - POST /v1/habitat/visit/end   → terminar mi visita activa
 *   - GET  /v1/habitat/visit/room  → la sala del amigo, para quien le visita
 *   - POST /v1/habitat/visit/interact → hablar por menú con el Pockai anfitrión
 *   - GET  /v1/habitat/visitors    → visitas activas donde el actor es el dueño
 */
@ApiTags('Habitat · Visita en vivo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('habitat')
export class HabitatVisitController {
  constructor(
    private readonly habitatVisitService: HabitatVisitService,
    private readonly dialog: VisitDialogService,
  ) {}

  @Post('visit/interact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hablar por menú con el Pockai del amigo al que estás visitando',
    description:
      'Solo con una visita en vivo activa (403 si no). Sin texto libre: sin `choice` empieza la conversación (o la retoma); ' +
      'con `choice` (índice de una de las opciones recibidas) avanza. Devuelve la línea del Pockai, su reacción y las opciones. ' +
      'Enviar también `turn` (el de la última respuesta) hace que repetir la petición no repita el efecto. ' +
      'Ofrecer un premio consume un alimento del inventario del visitante.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ownerId: { type: 'string', description: 'Opcional: el amigo visitado, si hay más de una visita activa' },
        choice: { type: 'integer', minimum: 0, description: 'Índice de la opción elegida' },
        turn: { type: 'integer', description: 'Turno de la respuesta a la que se contesta' },
      },
    },
  })
  interact(@CurrentUser() user: any, @Body() body: { ownerId?: string; choice?: number; turn?: number }): Promise<VisitInteraction> {
    return this.dialog.interact(user.id, {
      ownerId: typeof body?.ownerId === 'string' ? body.ownerId : undefined,
      choice: body?.choice,
      turn: typeof body?.turn === 'number' ? body.turn : undefined,
    });
  }

  @Post('visit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar una visita en vivo al habitat de un amigo',
    description:
      'Gasta 10 de energía del pet visitante. Cooldown de 10 min por amigo y máx. 10 visitas en 24 h. ' +
      'Si ya hay una visita activa con ese amigo, la devuelve sin cobrar ni volver a notificar.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['ownerId'],
      properties: {
        ownerId: { type: 'string', description: 'Dueño del habitat visitado' },
        message: { type: 'string', maxLength: 140, description: 'Mensaje corto opcional para el amigo' },
      },
    },
  })
  start(
    @CurrentUser() user: any,
    @Body() body: { ownerId?: string; message?: string | null },
  ): Promise<{ success: boolean; visit: ActiveVisitor; energy: number }> {
    return this.habitatVisitService.startVisit(user.id, body?.ownerId, body?.message);
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

  @Get('visit/room')
  @ApiOperation({
    summary: 'La sala del amigo al que estás visitando',
    description:
      'Solo con una visita en vivo activa (403 si no). Devuelve la sala (rejilla, tema y muebles) y el aspecto de los dos Pockai, ' +
      'para dibujar la visita en el cliente de quien visita. No incluye vitales, personalidad ni recuerdos del anfitrión.',
  })
  @ApiQuery({ name: 'ownerId', description: 'El amigo visitado' })
  room(@CurrentUser() user: any, @Query('ownerId') ownerId: string): Promise<VisitRoom> {
    return this.habitatVisitService.visitRoom(user.id, ownerId);
  }

  @Get('visitors')
  @ApiOperation({ summary: 'Visitas activas donde el actor es el dueño del habitat' })
  list(@CurrentUser() user: any): Promise<{ visitors: ActiveVisitor[] }> {
    return this.habitatVisitService.listVisitors(user.id);
  }
}
