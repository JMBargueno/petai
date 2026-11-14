import { ApiProperty } from '@nestjs/swagger';

/** Evento próximo (contrato `GET /events/upcoming`, feature 009-edge-cdn). */
export class UpcomingEventDto {
  @ApiProperty({ example: 'navidad', description: 'ID del evento.' })
  id: string;

  @ApiProperty({ example: 'Navidad', description: 'Nombre para la UI (es).' })
  name: string;

  @ApiProperty({ example: 'festival', description: 'Tipo: festival, buff, raid, ...' })
  type: string;

  @ApiProperty({ example: '2026-12-24T00:00:00.000Z', description: 'Inicio (ISO 8601).' })
  startsAt: string;

  @ApiProperty({
    example: '2026-12-26T23:59:59.000Z',
    nullable: true,
    description: 'Fin (ISO 8601) o null.',
  })
  endsAt: string | null;

  @ApiProperty({
    example: 'event/navidad/',
    nullable: true,
    description: 'Prefijo de assets a pre-cargar (el preloader lo usa si startsAt < 2h).',
  })
  assetPrefix: string | null;
}

/** Respuesta de `GET /events/upcoming`. */
export class UpcomingEventsDto {
  @ApiProperty({ example: 24, description: 'Ventana del endpoint (horas).' })
  windowHours: number;

  @ApiProperty({ type: [UpcomingEventDto], description: 'Eventos próximos (0..N).' })
  events: UpcomingEventDto[];
}