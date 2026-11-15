import { Body, Controller, Get, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminRecordsService } from './admin-records.service';
import {
  AdminAuditListDto,
  AdminEventDto,
  AdminItemDto,
  AdminSpeciesDto,
  AdminStatsDto,
  BulkPriceDto,
  BulkPriceResultDto,
  UpdateItemPriceDto,
} from './dto/admin.dto';

/** Endpoints del panel de administración (salvo usuarios, mascotas e invitaciones, que viven en authz/invites). */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('admin:access')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly overview: AdminOverviewService,
    private readonly records: AdminRecordsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Métricas del resumen del panel' })
  @ApiResponse({ status: HttpStatus.OK, type: AdminStatsDto })
  stats() {
    return this.overview.stats();
  }

  @Get('items')
  @RequirePermissions('economy:manage')
  @ApiOperation({ summary: 'Catálogo de la tienda con sus precios' })
  @ApiResponse({ status: HttpStatus.OK, type: [AdminItemDto] })
  listItems() {
    return this.catalog.listItems();
  }

  // Va antes de `items/:id` para que «prices» no se tome como un id.
  @Patch('items/prices')
  @RequirePermissions('economy:manage')
  @ApiOperation({ summary: 'Ajustar en bloque un porcentaje el precio de varios objetos (queda auditado)' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkPriceResultDto })
  bulkPrices(@CurrentUser() actor: any, @Body() body: BulkPriceDto) {
    return this.catalog.bulkAdjustPrices(actor, body);
  }

  @Patch('items/:id')
  @RequirePermissions('economy:manage')
  @ApiOperation({ summary: 'Cambiar el precio de un objeto (queda auditado)' })
  @ApiResponse({ status: HttpStatus.OK, type: AdminItemDto })
  updateItem(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: UpdateItemPriceDto) {
    return this.catalog.updateItemPrice(actor, id, body);
  }

  @Get('species')
  @ApiOperation({ summary: 'Especies que usa el juego (game-data, solo lectura)' })
  @ApiResponse({ status: HttpStatus.OK, type: [AdminSpeciesDto] })
  listSpecies() {
    return this.catalog.listSpecies();
  }

  @Get('events')
  @ApiOperation({ summary: 'Eventos del juego: festividades, temporadas, torneos y raids (solo lectura)' })
  @ApiResponse({ status: HttpStatus.OK, type: [AdminEventDto] })
  listEvents() {
    return this.overview.listEvents();
  }

  @Get('audit')
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Registro de auditoría (paginado; filtros: event, userId)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'event', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiResponse({ status: HttpStatus.OK, type: AdminAuditListDto })
  listAudit(@Query() query: Record<string, string>) {
    return this.records.listAudit(query);
  }
}
