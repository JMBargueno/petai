import { Controller, Get, GoneException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const GONE = 'La aventura diaria ha cambiado: actualiza la app para vivir las nuevas historias.';

/**
 * Rutas de la aventura anterior (feature 018), sustituida por las historias de decisión
 * (`/stories`). Se mantienen una versión para que los clientes sin actualizar no fallen: ven «sin
 * aventura en curso» y un historial vacío, y al intentar empezar reciben 410 con un aviso.
 * TRANSICIÓN: borrar este controlador junto con las tablas `Adventure` y `AdventureScene`.
 */
@ApiTags('Adventure (retirado)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('adventure')
export class LegacyAdventureController {
  @Get('current')
  @ApiOperation({ summary: 'Retirado: siempre sin aventura en curso. Usa GET /stories/today', deprecated: true })
  current() {
    return { active: false };
  }

  @Get('history')
  @ApiOperation({ summary: 'Retirado: siempre vacío. Usa GET /stories/history', deprecated: true })
  history() {
    return [];
  }

  @Post('start')
  @ApiOperation({ summary: 'Retirado (410). Usa POST /stories/:id/start', deprecated: true })
  start() {
    throw new GoneException(GONE);
  }

  @Post('choose')
  @ApiOperation({ summary: 'Retirado (410). Usa POST /stories/:id/answer', deprecated: true })
  choose() {
    throw new GoneException(GONE);
  }
}
