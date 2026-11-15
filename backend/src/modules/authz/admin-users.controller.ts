import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminUsersService } from './admin-users.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { ROLES } from './roles';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

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
}
