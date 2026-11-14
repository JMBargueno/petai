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
import { BuddiesService } from './buddies.service';

@ApiTags('PetBuddies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/buddies')
export class BuddiesController {
  constructor(private readonly buddies: BuddiesService) {}

  @Post('pair')
  @ApiOperation({ summary: 'Crear/obtener el par buddy entre dos pets del mismo usuario' })
  @ApiResponse({ status: 200, description: 'Par creado o recuperado' })
  @ApiResponse({ status: 400, description: 'Pets inválidos o del mismo pet' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  pair(
    @CurrentUser() user: { id: string },
    @Body() body: { petAId: string; petBId: string },
  ) {
    return this.buddies.pair(user.id, body.petAId, body.petBId);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Rolar y aplicar una interacción espontánea entre buddies' })
  @ApiResponse({ status: 200, description: 'Interacción aplicada o null si no procede' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  trigger(
    @CurrentUser() user: { id: string },
    @Body() body: { petId?: string } = {},
  ) {
    return this.buddies.trigger(user.id, body.petId);
  }

  @Get('interactions')
  @ApiOperation({ summary: 'Historial de interacciones buddy del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de interacciones' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  interactions(
    @CurrentUser() user: { id: string },
    @Query('limit') limit = 50,
  ) {
    return this.buddies.interactions(user.id, Number(limit) || 50);
  }

  @Get(':petId')
  @ApiOperation({ summary: 'Estado buddy de un pet' })
  @ApiResponse({ status: 200, description: 'Estado buddy del pet' })
  @ApiResponse({ status: 404, description: 'Pet no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getForPet(@CurrentUser() user: { id: string }, @Param('petId') petId: string) {
    return this.buddies.getForPet(user.id, petId);
  }
}
