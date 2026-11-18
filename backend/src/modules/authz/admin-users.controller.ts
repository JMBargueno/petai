import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminUsersService } from './admin-users.service';
import { EmailVerificationService } from '../auth/email-verification.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { ROLES } from './roles';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly verification: EmailVerificationService,
  ) {}

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Listar usuarios (paginado; filtros: role, q)' })
  list(@Query() query: Record<string, string>) {
    return this.adminUsers.list(query);
  }

  @Patch(':id/role')
  @RequirePermissions('users:role:assign')
  @ApiOperation({ summary: 'Cambiar el rol de un usuario (cierra sus sesiones y queda auditado)' })
  @ApiBody({ schema: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: [...ROLES] } } } })
  assignRole(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.adminUsers.assignRole(actor, id, body);
  }

  @Patch(':id/balance')
  @RequirePermissions('economy:manage')
  @ApiOperation({ summary: 'Fijar monedas y/o gemas de un usuario (valor absoluto; queda auditado)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { coins: { type: 'integer', minimum: 0 }, gems: { type: 'integer', minimum: 0 } },
    },
  })
  adjustBalance(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.adminUsers.adjustBalance(actor, id, body);
  }

  @Post(':id/verify-email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:verify')
  @ApiOperation({ summary: 'Marcar el correo de un usuario como verificado (soporte; queda auditado)' })
  markVerified(@CurrentUser() actor: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.verification.markVerified(id, actor.id);
  }

  @Post(':id/resend-verification')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:verify')
  @ApiOperation({ summary: 'Reenviar el correo de verificación a un usuario sin verificar' })
  resendVerification(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.send(id, { throttled: false });
  }
}
