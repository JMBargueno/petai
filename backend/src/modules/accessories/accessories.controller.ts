import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodPipe } from '../../common/zod.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessoriesService } from './accessories.service';
import { EquipAccessoriesDto, equipAccessoriesSchema, type EquipAccessoriesInput } from './accessories.schemas';

@ApiTags('Accessories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AccessoriesController {
  constructor(private readonly accessories: AccessoriesService) {}

  @Get('accessories')
  @ApiOperation({ summary: 'Catálogo de accesorios con el estado de cada prenda para el usuario' })
  @ApiResponse({ status: 200, description: 'Ranuras y prendas, cada una locked, available u owned' })
  list(@CurrentUser() user: { id: string }) {
    return this.accessories.list(user.id);
  }

  @Post('accessories/:id/buy')
  @ApiOperation({ summary: 'Comprar una prenda con monedas o gemas' })
  @ApiResponse({ status: 201, description: 'Prenda comprada' })
  @ApiResponse({ status: 400, description: 'Sin saldo, ya en propiedad o prenda de logro' })
  @ApiResponse({ status: 404, description: 'Prenda no encontrada' })
  buy(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.accessories.buy(user.id, id);
  }

  @Get('pets/:petId/accessories')
  @ApiOperation({ summary: 'Prendas equipadas de una mascota' })
  @ApiResponse({ status: 404, description: 'Pet no encontrado' })
  getEquipped(@CurrentUser() user: { id: string }, @Param('petId') petId: string) {
    return this.accessories.getEquipped(user.id, petId);
  }

  @Put('pets/:petId/accessories')
  @ApiOperation({
    summary: 'Equipar o quitar prendas por ranura',
    description: 'Cada ranura admite un itemId (equipar) o null (quitar). Lo que no se envía se conserva.',
  })
  @ApiBody({ type: EquipAccessoriesDto })
  @ApiResponse({ status: 200, description: 'Prendas equipadas tras el cambio' })
  @ApiResponse({ status: 400, description: 'Prenda inexistente, de otra ranura o que no es del usuario' })
  @ApiResponse({ status: 404, description: 'Pet no encontrado' })
  equip(
    @CurrentUser() user: { id: string },
    @Param('petId') petId: string,
    @Body(new ZodPipe(equipAccessoriesSchema)) body: EquipAccessoriesInput,
  ) {
    return this.accessories.equip(user.id, petId, body);
  }
}
