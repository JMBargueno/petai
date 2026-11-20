import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiQuery, ApiExtraModels } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { BondingService } from '../bonding/bonding.service';
import { BondingDetailResponseDto, BondingFieldsDto } from '../bonding/dto/bonding.dto';
import { UpdateDesktopSkillsDto } from './dto/desktop-skills.dto';
import { UpdateInHabitatDto } from './dto/in-habitat.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Pets')
// El esquema `BondingFieldsDto` documenta los campos de vínculo que `GET /pets` y `GET /pets/:id`
// añaden a cada respuesta (feature 006)
@ApiExtraModels(BondingFieldsDto)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(
    private readonly petsService: PetsService,
    private readonly bondingService: BondingService,
  ) {}

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

  @Get(':id/bonding')
  @ApiOperation({
    summary:
      'Detalle del métrico de vínculo: valor, rango, historial paginado de cambios, decaimiento y desbloqueos',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Nº de BondingEvent en history (1-100, default 20)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'createdAt ISO-8601 de la última fila de la página previa' })
  @ApiOkResponse({ type: BondingDetailResponseDto })
  async getBonding(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    // Primero el lazy tick (vitales + decaimiento de vínculo); después el detalle
    await this.petsService.getPetById(user.id, petId);
    const limit = limitRaw !== undefined ? Number(limitRaw) : undefined;
    return this.bondingService.getBondingDetail(petId, user.id, limit, cursor);
  }

  @Post(':id/feed')
  @ApiOperation({ summary: 'Alimentar a la mascota con un objeto del inventario' })
  feed(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { itemId: string } | undefined,
  ) {
    return this.petsService.feed(user.id, petId, body?.itemId);
  }

  @Post(':id/clean')
  @ApiOperation({ summary: 'Bañar / limpiar a la mascota' })
  clean(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.clean(user.id, petId);
  }

  @Post(':id/pet')
  @ApiOperation({ summary: 'Acariciar a la mascota (sube vínculo, con cooldown)' })
  caress(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.caress(user.id, petId);
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

  @Post(':id/evolve')
  @ApiOperation({ summary: 'Evolucionar a la forma final (nivel 50 + objeto especial)' })
  evolve(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.evolve(user.id, petId);
  }

  @Post(':id/use-item')
  @ApiOperation({ summary: 'Usar un objeto del inventario sobre la mascota (comida, medicina, evolución o subida de nivel)' })
  useItem(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: { itemId: string } | undefined,
  ) {
    return this.petsService.useItem(user.id, petId, body?.itemId);
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

  @Patch(':id/desktop-skills')
  @ApiOperation({ summary: 'Actualizar las autorizaciones de habilidades de escritorio de la mascota' })
  updateDesktopSkills(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: UpdateDesktopSkillsDto,
  ) {
    return this.petsService.updateDesktopSkills(user.id, petId, body.skills);
  }

  @Patch(':id/in-habitat')
  @ApiOperation({ summary: 'Actualizar el estado de reclusión en el hábitat (casa) de la mascota' })
  updateInHabitat(
    @CurrentUser() user: any,
    @Param('id') petId: string,
    @Body() body: UpdateInHabitatDto,
  ) {
    return this.petsService.setInHabitat(user.id, petId, body.inHabitat);
  }

  @Post(':id/activate')
  @ApiOperation({
    summary: 'Elegir esta mascota como pockai activo (la que representa al jugador en su clan y visitas)',
  })
  activate(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.petsService.setActivePet(user.id, petId);
  }
}
