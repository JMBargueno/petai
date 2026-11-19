import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CreatedVouchersDto, CreateVouchersDto, RewardAccessoryOptionDto, RewardItemOptionDto, GrantRewardsDto, RewardReceivedDto, VoucherDto, VoucherListDto } from './dto/vouchers.dto';
import { RewardsService } from './rewards.service';
import { VOUCHER_STATUSES } from './vouchers.schemas';
import { VouchersService } from './vouchers.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('vouchers:manage')
@Controller('admin')
export class AdminVouchersController {
  constructor(
    private readonly vouchers: VouchersService,
    private readonly rewards: RewardsService,
  ) {}

  @Get('vouchers')
  @ApiOperation({ summary: 'Listar vouchers de recompensas (paginado; filtro: status)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: VOUCHER_STATUSES })
  @ApiResponse({ status: HttpStatus.OK, type: VoucherListDto })
  list(@Query() query: Record<string, string>) {
    return this.vouchers.list(query);
  }

  @Get('vouchers/accessories')
  @ApiOperation({ summary: 'Prendas que se pueden incluir en un voucher o regalo (catálogo de accessories.json)' })
  @ApiResponse({ status: HttpStatus.OK, type: [RewardAccessoryOptionDto] })
  accessories() {
    return this.rewards.accessoryOptions();
  }

  @Get('vouchers/items')
  @ApiOperation({ summary: 'Consumibles que se pueden incluir en un voucher o regalo (foods.json, también los de solo drop y los ocultos)' })
  @ApiResponse({ status: HttpStatus.OK, type: [RewardItemOptionDto] })
  items() {
    return this.rewards.itemOptions();
  }

  @Post('vouchers')
  @ApiOperation({ summary: 'Crear vouchers (lote aleatorio o código personalizado). Días Pro: exige billing:manage' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CreatedVouchersDto })
  create(@CurrentUser() actor: any, @Body() body: CreateVouchersDto) {
    return this.vouchers.create(actor, body);
  }

  @Post('vouchers/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar un voucher (idempotente)' })
  @ApiResponse({ status: HttpStatus.OK, type: VoucherDto })
  revoke(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.revoke(actor, id);
  }

  @Post('users/:id/grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dar un paquete de recompensas a un usuario (queda auditado). Días Pro: exige billing:manage' })
  @ApiResponse({ status: HttpStatus.OK, type: RewardReceivedDto })
  grant(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: GrantRewardsDto) {
    return this.rewards.grantToUser(actor, id, body);
  }
}
