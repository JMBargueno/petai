import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminPetsService } from './admin-pets.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/pets')
export class AdminPetsController {
  constructor(private readonly adminPets: AdminPetsService) {}

  @Get()
  @RequirePermissions('pets:read')
  @ApiOperation({ summary: 'Listar mascotas (paginado; filtros: rarity, q por nickname o dueño)' })
  list(@Query() query: Record<string, string>) {
    return this.adminPets.list(query);
  }

  @Patch(':id')
  @RequirePermissions('pets:rename')
  @ApiOperation({ summary: 'Renombrar una mascota (auditoría: pet_rename)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nickname'],
      properties: { nickname: { type: 'string', maxLength: 16 } },
    },
  })
  rename(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: unknown) {
    return this.adminPets.rename(actor, id, body);
  }
}