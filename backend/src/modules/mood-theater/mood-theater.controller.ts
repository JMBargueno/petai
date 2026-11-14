import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MoodTheaterService } from './mood-theater.service';

@ApiTags('MoodTheater')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mood-theater')
export class MoodTheaterController {
  constructor(private readonly theater: MoodTheaterService) {}

  @Get('current')
  @ApiOperation({ summary: 'Acto espontáneo actual del pet según contexto/vitals' })
  @ApiResponse({ status: 200, description: 'Acto actual (o null)' })
  @ApiResponse({ status: 404, description: 'Pet no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  current(
    @CurrentUser() user: { id: string },
    @Query('petId') petId: string,
    @Query('favoriteFood') favoriteFood?: string,
    @Query('battleLost') battleLost?: string,
    @Query('levelUp') levelUp?: string,
    @Query('wokeUp') wokeUp?: string,
  ) {
    const truthy = (v?: string) => v === 'true' || v === '1';
    return this.theater.current(user.id, petId, {
      favoriteFood: truthy(favoriteFood),
      battleLost: truthy(battleLost),
      levelUp: truthy(levelUp),
      wokeUp: truthy(wokeUp),
    });
  }

  @Post('capture')
  @ApiOperation({ summary: 'Capturar un momento como sticker' })
  @ApiResponse({ status: 201, description: 'Sticker capturado' })
  @ApiResponse({ status: 400, description: 'No hay momento activo' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  capture(
    @CurrentUser() user: { id: string },
    @Body() body: { petId: string; momentId?: string },
  ) {
    return this.theater.capture(user.id, body.petId, body.momentId);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Feed social de actos públicos de otros pets' })
  @ApiResponse({ status: 200, description: 'Lista de momentos' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  feed(@CurrentUser() user: { id: string }, @Query('limit') limit = 20) {
    return this.theater.feed(user.id, Number(limit) || 20);
  }
}
