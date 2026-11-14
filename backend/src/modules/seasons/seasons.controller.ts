import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SeasonsService } from './seasons.service';

@ApiTags('Seasons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Obtener la temporada actual con tiers y recompensas' })
  @ApiResponse({ status: 200, description: 'Temporada actual' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getCurrentSeason() {
    return this.seasonsService.getCurrentSeason();
  }

  @Get('progress')
  @ApiOperation({ summary: 'Obtener el progreso del usuario en la temporada actual' })
  @ApiResponse({ status: 200, description: 'Progreso de temporada' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getProgress(@CurrentUser() user: { id: string }) {
    return this.seasonsService.getProgress(user.id);
  }

  @Post('pass/purchase')
  @ApiOperation({ summary: 'Comprar el pase de temporada' })
  @ApiResponse({ status: 201, description: 'Pase comprado' })
  @ApiResponse({ status: 400, description: 'Saldo insuficiente' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 409, description: 'Pase ya comprado' })
  purchasePass(@CurrentUser() user: { id: string }) {
    return this.seasonsService.purchasePass(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalles de una temporada específica' })
  @ApiResponse({ status: 200, description: 'Detalle de la temporada' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Temporada no encontrada' })
  getSeasonById(@Param('id') seasonId: string) {
    return this.seasonsService.getSeasonById(seasonId);
  }
}
