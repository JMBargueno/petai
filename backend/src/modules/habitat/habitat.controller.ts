import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { HabitatService } from './habitat.service';

@ApiTags('Habitat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('habitat')
export class HabitatController {
  constructor(private readonly habitatService: HabitatService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener el hábitat del usuario (salas, layout, buffs)' })
  @ApiResponse({ status: 200, description: 'Hábitat completo' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 404, description: 'Pet no encontrado' })
  getHabitat(@CurrentUser() user: { id: string }) {
    return this.habitatService.getHabitat(user.id);
  }

  @Post('furniture/:id/place')
  @ApiOperation({ summary: 'Colocar un mueble en una celda del hábitat' })
  @ApiResponse({ status: 201, description: 'Mueble colocado' })
  @ApiResponse({ status: 400, description: 'Celda ocupada o sala bloqueada' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Mueble o pet no encontrado' })
  placeFurniture(
    @CurrentUser() user: { id: string },
    @Param('id') furnitureId: string,
  ) {
    return this.habitatService.placeFurniture(user.id, furnitureId);
  }

  @Delete('furniture/:id')
  @ApiOperation({ summary: 'Quitar un mueble del hábitat' })
  @ApiResponse({ status: 200, description: 'Mueble removido' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Mueble no encontrado' })
  removeFurniture(
    @CurrentUser() user: { id: string },
    @Param('id') furnitureId: string,
  ) {
    return this.habitatService.removeFurniture(user.id, furnitureId);
  }

  @Get('buffs')
  @ApiOperation({ summary: 'Obtener los buffs activos del hábitat' })
  @ApiResponse({ status: 200, description: 'Buffs agregados de muebles colocados' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getActiveBuffs(@CurrentUser() user: { id: string }) {
    return this.habitatService.getActiveBuffs(user.id);
  }
}
