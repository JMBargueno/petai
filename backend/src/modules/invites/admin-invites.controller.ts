import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { CreatedInvitesDto, CreateInvitesDto, InviteCodeDto, InviteListDto, RegistrationSettingsDto } from './dto/invites.dto';
import { INVITE_STATUSES } from './invites.schemas';
import { InvitesService } from './invites.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('invites:manage')
@Controller('admin')
export class AdminInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get('registration-settings')
  @ApiOperation({ summary: 'Ajustes del registro (¿solo con invitación?)' })
  @ApiResponse({ status: HttpStatus.OK, type: RegistrationSettingsDto })
  getSettings() {
    return this.invites.getRegistrationSettings();
  }

  @Patch('registration-settings')
  @ApiOperation({ summary: 'Activar o desactivar el registro solo con invitación (queda auditado)' })
  @ApiResponse({ status: HttpStatus.OK, type: RegistrationSettingsDto })
  setSettings(@CurrentUser() actor: any, @Body() body: RegistrationSettingsDto) {
    return this.invites.setRegistrationSettings(actor, body);
  }

  @Get('invites')
  @ApiOperation({ summary: 'Listar códigos de invitación (paginado; filtro: status)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: INVITE_STATUSES })
  @ApiResponse({ status: HttpStatus.OK, type: InviteListDto })
  list(@Query() query: Record<string, string>) {
    return this.invites.list(query);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Generar códigos de invitación' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CreatedInvitesDto })
  create(@CurrentUser() actor: any, @Body() body: CreateInvitesDto) {
    return this.invites.create(actor, body);
  }

  @Post('invites/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar un código de invitación (idempotente)' })
  @ApiResponse({ status: HttpStatus.OK, type: InviteCodeDto })
  revoke(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invites.revoke(actor, id);
  }
}
