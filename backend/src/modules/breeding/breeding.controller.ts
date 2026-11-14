import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BreedingService } from './breeding.service';

@ApiTags('Breeding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('breeding')
export class BreedingController {
  constructor(private readonly breedingService: BreedingService) {}

  @Post('start')
  @ApiOperation({ summary: 'Iniciar una cría entre dos pets' })
  @ApiResponse({ status: 201, description: 'Cría iniciada' })
  @ApiResponse({ status: 400, description: 'Pets inválidos o cooldown activo' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Pet no encontrado' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['parent1Id', 'parent2Id'],
      properties: {
        parent1Id: { type: 'string', description: 'ID del primer progenitor' },
        parent2Id: { type: 'string', description: 'ID del segundo progenitor' },
      },
    },
  })
  startBreeding(
    @CurrentUser() user: { id: string },
    @Body() body: { parent1Id: string; parent2Id: string },
  ) {
    return this.breedingService.startBreeding(user.id, body.parent1Id, body.parent2Id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener el estado de una cría' })
  @ApiResponse({ status: 200, description: 'Estado de la cría' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Cría no encontrada' })
  getBreeding(
    @CurrentUser() user: { id: string },
    @Param('id') breedingId: string,
  ) {
    return this.breedingService.getBreeding(user.id, breedingId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Obtener el historial de crías del usuario' })
  @ApiResponse({ status: 200, description: 'Historial de crías' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getHistory(@CurrentUser() user: { id: string }) {
    return this.breedingService.getHistory(user.id);
  }
}
