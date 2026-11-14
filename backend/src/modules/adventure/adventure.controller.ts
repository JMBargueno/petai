import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdventureService } from './adventure.service';

@ApiTags('Adventure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('adventure')
export class AdventureController {
  constructor(private readonly adventure: AdventureService) {}

  @Post('start')
  @ApiOperation({ summary: 'Iniciar aventura diaria (1 gratis/día, premium con gemas)' })
  start(
    @CurrentUser() user: any,
    @Body() body: { petId: string; premium?: boolean },
  ) {
    return this.adventure.startDaily(user.id, body.petId, body.premium ?? false);
  }

  @Post('choose')
  @ApiOperation({ summary: 'Elegir opción y avanzar a la siguiente escena' })
  choose(
    @CurrentUser() user: any,
    @Body() body: { adventureId: string; optionIndex: number },
  ) {
    return this.adventure.choose(user.id, body.adventureId, body.optionIndex);
  }

  @Get('current')
  @ApiOperation({ summary: 'Ver aventura en curso' })
  current(@CurrentUser() user: any) {
    return this.adventure.getCurrent(user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial de aventuras completadas' })
  history(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.adventure.getHistory(user.id, limit ? Number(limit) : 20);
  }
}