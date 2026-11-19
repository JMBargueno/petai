import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ZodPipe } from '../../common/zod.pipe';
import {
  MoveFurnitureDto,
  PlaceFurnitureDto,
  moveFurnitureSchema,
  placeFurnitureSchema,
  type MoveFurnitureInput,
  type PlaceFurnitureInput,
} from './habitat.schemas';
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
  @ApiOperation({
    summary: 'Comprar y colocar un mueble',
    description:
      'Con x/y (y rotation opcional) lo coloca en esa celda si cabe su huella; sin cuerpo, en el primer hueco libre.',
  })
  @ApiBody({ type: PlaceFurnitureDto, required: false })
  @ApiResponse({ status: 201, description: 'Mueble colocado (incluye itemId, x, y y rotation)' })
  @ApiResponse({ status: 400, description: 'Posición no válida, sin hueco, sin saldo o sala bloqueada' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Mueble o pet no encontrado' })
  placeFurniture(
    @CurrentUser() user: { id: string },
    @Param('id') furnitureId: string,
    @Body(new ZodPipe(placeFurnitureSchema)) body: PlaceFurnitureInput,
  ) {
    return this.habitatService.placeFurniture(user.id, furnitureId, body);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Mover y/o girar un mueble ya colocado (sin coste)' })
  @ApiBody({ type: MoveFurnitureDto })
  @ApiResponse({ status: 200, description: 'Mueble movido' })
  @ApiResponse({ status: 400, description: 'Posición no válida (fuera de la sala, ocupada o lejos de la pared)' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Mueble no encontrado en el hábitat' })
  moveFurniture(
    @CurrentUser() user: { id: string },
    @Param('itemId') itemId: string,
    @Body(new ZodPipe(moveFurnitureSchema)) body: MoveFurnitureInput,
  ) {
    return this.habitatService.moveFurniture(user.id, itemId, body);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Quitar un mueble concreto del hábitat (por id de item)' })
  @ApiResponse({ status: 200, description: 'Mueble removido' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Mueble no encontrado en el hábitat' })
  removeItem(@CurrentUser() user: { id: string }, @Param('itemId') itemId: string) {
    return this.habitatService.removeItem(user.id, itemId);
  }

  @Post('items/:itemId/use')
  @ApiOperation({
    summary: 'El Pockai ha usado un mueble de su sala',
    description:
      'Lo avisa el cliente cuando el Pockai usa un mueble por su cuenta. El efecto es pequeño y está acotado: tope diario por mascota y ' +
      'enfriamiento entre usos. Pasados los límites responde 201 con `applied: false` y el motivo, no un error.',
  })
  @ApiResponse({ status: 201, description: 'Resultado del uso (aplicado o no) y vitales actuales' })
  @ApiResponse({ status: 400, description: 'El mueble no se puede usar' })
  @ApiResponse({ status: 404, description: 'Mueble no encontrado en el hábitat' })
  useItem(@CurrentUser() user: { id: string }, @Param('itemId') itemId: string) {
    return this.habitatService.useItem(user.id, itemId);
  }

  @Delete('furniture/:id')
  @ApiOperation({ summary: 'Quitar un mueble del hábitat por tipo (el más reciente). Preferible: DELETE items/:itemId' })
  @ApiResponse({ status: 200, description: 'Mueble removido' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  @ApiResponse({ status: 404, description: 'Mueble no encontrado' })
  removeFurniture(
    @CurrentUser() user: { id: string },
    @Param('id') furnitureId: string,
  ) {
    return this.habitatService.removeFurniture(user.id, furnitureId);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Catálogo del hábitat: salas, muebles (precio/moneda/buffs) y topes de buffs' })
  @ApiResponse({ status: 200, description: 'Catálogo completo' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  getCatalog() {
    return this.habitatService.getCatalog();
  }

  @Get('buffs')
  @ApiOperation({ summary: 'Obtener los buffs activos del hábitat' })
  @ApiResponse({ status: 200, description: 'Buffs agregados de muebles colocados' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getActiveBuffs(@CurrentUser() user: { id: string }) {
    return this.habitatService.getActiveBuffs(user.id);
  }
}
