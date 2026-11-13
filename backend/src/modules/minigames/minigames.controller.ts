import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MinigamesService } from './minigames.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Minigames')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('minigames')
export class MinigamesController {
  constructor(private readonly minigamesService: MinigamesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar minijuegos disponibles' })
  list() {
    return this.minigamesService.listGames();
  }

  @Post('sessions/:id/finish')
  @ApiOperation({ summary: 'Enviar la puntuación final y recibir recompensas validadas' })
  finish(
    @CurrentUser() user: any,
    @Param('id') sessionId: string,
    @Body() body: { score: number } | undefined,
  ) {
    return this.minigamesService.finish(user.id, sessionId, body?.score as number);
  }

  @Post(':gameId/start')
  @ApiOperation({ summary: 'Iniciar sesión de minijuego (devuelve sessionId y seed)' })
  start(
    @CurrentUser() user: any,
    @Param('gameId') gameId: string,
    @Body() body: { petId: string } | undefined,
  ) {
    return this.minigamesService.start(user.id, gameId, body?.petId as string);
  }
}
