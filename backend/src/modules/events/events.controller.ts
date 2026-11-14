import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EventsService } from './events.service';
import { UpcomingEventsDto } from './dto/event.dto';

/**
 * Endpoint de eventos próximos (feature 009-edge-cdn, T024). Requiere Bearer JWT.
 * `GET /events/upcoming` → eventos de las próximas 24h con `assetPrefix` para el preloader.
 */
@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('upcoming')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Eventos de juego de las próximas 24h (con assetPrefix a pre-cargar)' })
  @ApiResponse({ status: 200, type: UpcomingEventsDto, description: 'Eventos próximos' })
  @ApiResponse({ status: 401, description: 'Token ausente/inválido/expirado' })
  @ApiResponse({ status: 500, description: 'Fuente de eventos inaccesible' })
  upcoming(@CurrentUser() user: { id: string }) {
    return this.eventsService.getUpcoming(user.id);
  }
}