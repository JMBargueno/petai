import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Pets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las mascotas del usuario con deterioro perezoso calculado' })
  getPets(@CurrentUser() user: any) {
    return this.petsService.getPets(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una mascota específica' })
  getPet(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.getPetById(user.id, petId);
  }

  @Post(':id/feed')
  @ApiOperation({ summary: 'Alimentar a la mascota con un objeto del inventario' })
  feed(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { itemId: string },
  ) {
    return this.petsService.feed(user.id, petId, body.itemId);
  }

  @Post(':id/clean')
  @ApiOperation({ summary: 'Bañar / limpiar a la mascota' })
  clean(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.clean(user.id, petId);
  }

  @Post(':id/sleep')
  @ApiOperation({ summary: 'Poner a dormir a la mascota' })
  sleep(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.sleep(user.id, petId);
  }

  @Post(':id/wake')
  @ApiOperation({ summary: 'Despertar a la mascota' })
  wake(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.wake(user.id, petId);
  }

  @Post(':id/heal')
  @ApiOperation({ summary: 'Administrar medicina a la mascota' })
  heal(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { itemId: string } | undefined,
  ) {
    return this.petsService.heal(user.id, petId, body?.itemId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modificar apodo o estrategia de combate de la mascota' })
  updatePet(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { nickname?: string; strategy?: string },
  ) {
    return this.petsService.updatePet(user.id, petId, body);
  }
}
