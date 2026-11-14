import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ModdingService, PublishModDto, WorkshopFilters } from './modding.service';
import { ZodPipe } from '../../common/zod.pipe';
import { publishModSchema, modRateSchema, modReportSchema, downloadModSchema, updateModSchema } from './modding.schemas';

@ApiTags('Modding')
@Controller('modding')
export class ModdingController {
  constructor(private readonly moddingService: ModdingService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('publish')
  @ApiOperation({ summary: 'Publicar un mod (especie, mueble o minigame)' })
  @ApiResponse({ status: 201, description: 'Mod publicado' })
  @ApiResponse({ status: 400, description: 'Payload/asset inválido' })
  @ApiResponse({ status: 429, description: 'Rate limit (5/día)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'name', 'data'],
      properties: {
        type: { type: 'string', enum: ['species', 'furniture', 'minigame'], description: 'Tipo de mod' },
        name: { type: 'string', description: 'Nombre del mod' },
        description: { type: 'string', description: 'Descripción' },
        element: { type: 'string', description: 'Elemento (especie)' },
        rarity: { type: 'string', description: 'Rareza (especie)' },
        data: { type: 'object', description: 'Datos del mod según su tipo' },
        sprite: { type: 'string', format: 'base64', description: 'Sprite en base64' },
        spriteUrl: { type: 'string', description: 'URL del sprite' },
        minigameCode: { type: 'string', description: 'Código del minigame' },
        minigameUrl: { type: 'string', description: 'URL del minigame' },
      },
    },
  })
  publish(@CurrentUser() user: { id: string }, @Body(new ZodPipe(publishModSchema)) dto: PublishModDto) {
    return this.moddingService.publish(user.id, dto);
  }

  @Get('workshop')
  @ApiOperation({ summary: 'Workshop: listar y filtrar mods publicados' })
  @ApiResponse({ status: 200, description: 'Lista paginada de mods' })
  workshop(
    @Query('type') type?: WorkshopFilters['type'],
    @Query('element') element?: string,
    @Query('rarity') rarity?: string,
    @Query('sort') sort?: WorkshopFilters['sort'],
    @Query('q') q?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.moddingService.workshop({
      type,
      element,
      rarity,
      sort,
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un mod (snapshot)' })
  @ApiResponse({ status: 200, description: 'Detalle del mod' })
  @ApiResponse({ status: 404, description: 'Mod no encontrado' })
  getById(@Param('id') id: string) {
    return this.moddingService.getById(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/rate')
  @ApiOperation({ summary: 'Rating de 1-5 estrellas' })
  @ApiResponse({ status: 201, description: 'Rating registrado' })
  @ApiResponse({ status: 404, description: 'Mod no encontrado' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['stars'],
      properties: {
        stars: { type: 'integer', minimum: 1, maximum: 5, description: 'Rating de 1 a 5' },
        rating: { type: 'string', description: 'Comentario (opcional)' },
      },
    },
  })
  rate(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body(new ZodPipe(modRateSchema)) body: { stars: number; rating?: string },
  ) {
    return this.moddingService.rate(user.id, id, body.stars, body.rating);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/report')
  @ApiOperation({ summary: 'Reportar un mod (3 reports → auto-hidden)' })
  @ApiResponse({ status: 201, description: 'Report registrado' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', description: 'Motivo del reporte' },
        details: { type: 'string', description: 'Detalle (opcional)' },
      },
    },
  })
  report(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body(new ZodPipe(modReportSchema)) body: { reason: string; details?: string },
  ) {
    return this.moddingService.report(user.id, id, body.reason, body.details);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/download')
  @ApiOperation({ summary: 'Registrar descarga (+snapshot)' })
  @ApiResponse({ status: 201, description: 'Mod descargado' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        petId: { type: 'string', description: 'Pet que usa el mod (opcional, para snapshot)' },
      },
    },
  })
  download(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body(new ZodPipe(downloadModSchema)) body: { petId?: string }) {
    return this.moddingService.download(user.id, id, body?.petId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Editar un mod (solo creator)' })
  @ApiResponse({ status: 200, description: 'Mod actualizado' })
  @ApiResponse({ status: 403, description: 'No es el creator' })
  @ApiBody({
    schema: {
      type: 'object',
      description: 'Actualización parcial: solo se envían los campos a cambiar',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        element: { type: 'string' },
        rarity: { type: 'string' },
        data: { type: 'object' },
        sprite: { type: 'string', format: 'base64' },
        spriteUrl: { type: 'string' },
        minigameUrl: { type: 'string' },
      },
    },
  })
  update(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body(new ZodPipe(updateModSchema)) dto: Partial<PublishModDto>) {
    return this.moddingService.update(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Borrar un mod (soft, solo creator)' })
  @ApiResponse({ status: 200, description: 'Mod borrado' })
  @ApiResponse({ status: 403, description: 'No es el creator' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.moddingService.remove(user.id, id);
  }
}
