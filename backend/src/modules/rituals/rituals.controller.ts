import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RitualsService, CreateRitualInput } from './rituals.service';

@ApiTags('Rituals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rituals')
export class RitualsController {
  constructor(private readonly rituals: RitualsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los rituales del usuario con su progreso' })
  @ApiResponse({ status: 200, description: 'Lista de rituales' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  list(@CurrentUser() user: { id: string }) {
    return this.rituals.list(user.id);
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar solo los rituales activos' })
  @ApiResponse({ status: 200, description: 'Rituales activos' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  active(@CurrentUser() user: { id: string }) {
    return this.rituals.active(user.id);
  }

  @Post('create')
  @ApiOperation({ summary: 'Crear un ritual activo' })
  @ApiResponse({ status: 201, description: 'Ritual creado' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  create(@CurrentUser() user: { id: string }, @Body() input: CreateRitualInput) {
    return this.rituals.create(user.id, input);
  }

  @Post(':id/check')
  @ApiOperation({ summary: 'Registrar la completación de hoy del ritual' })
  @ApiResponse({ status: 200, description: 'Progreso actualizado (con gift si aplica)' })
  @ApiResponse({ status: 404, description: 'Ritual no encontrado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  check(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: { completionAt?: string } = {},
  ) {
    return this.rituals.check(user.id, id, body.completionAt);
  }
}
