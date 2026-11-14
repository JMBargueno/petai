import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TournamentService } from './tournament.service';

@ApiTags('Tournament')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tournament')
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Get('current')
  @ApiOperation({ summary: 'Torneo actual con estado, bracket y premios' })
  current(@CurrentUser() user: any) {
    return this.tournamentService.getCurrent(user.id);
  }

  @Post('enter')
  @ApiOperation({ summary: 'Inscribir al torneo (50 gemas de cuota)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['petId'],
      properties: {
        petId: { type: 'string', description: 'Pet inscrito al torneo' },
      },
    },
  })
  enter(@CurrentUser() user: any, @Body() body: { petId: string }) {
    return this.tournamentService.enter(user.id, body?.petId);
  }

  @Get('bracket')
  @ApiOperation({ summary: 'Bracket completo del torneo (público)' })
  bracket() {
    return this.tournamentService.getBracket();
  }

  @Get('standings')
  @ApiOperation({ summary: 'Posiciones y progreso del usuario en el torneo (paginado)' })
  standings(@CurrentUser() user: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.tournamentService.standings(user.id, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }
}