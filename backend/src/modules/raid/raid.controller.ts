import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RaidService } from './raid.service';

@ApiTags('Raid')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('raid')
export class RaidController {
  constructor(private readonly raidService: RaidService) {}

  @Get('current')
  @ApiOperation({ summary: 'Ver el boss de raid activo con HP global y contribuciones' })
  current(@CurrentUser() user: any) {
    return this.raidService.getCurrent(user.id);
  }

  @Post('attack')
  @ApiOperation({ summary: 'Atacar al boss con un pet (consume energía, combate determinista)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['petId'],
      properties: {
        petId: { type: 'string', description: 'Pet que ataca' },
      },
    },
  })
  attack(
    @CurrentUser() user: any,
    @Body() body: { petId: string },
  ) {
    return this.raidService.attack(user.id, body?.petId);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Top 100 contribuciones al raid actual' })
  leaderboard(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.raidService.leaderboard(user.id, limit ? Number(limit) : 100);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial de raids pasadas' })
  history(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.raidService.history(user.id, limit ? Number(limit) : 10);
  }
}