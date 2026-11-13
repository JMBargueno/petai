import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  getMe(@CurrentUser() user: any) {
    return this.usersService.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar preferencias del usuario' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        displayName: { type: 'string' },
        timezone: { type: 'string' },
        latitude: { type: 'number', nullable: true, description: 'Coordenada opt-in para el clima (se borra con null)' },
        longitude: { type: 'number', nullable: true, description: 'Coordenada opt-in para el clima (se borra con null)' },
        birthday: { type: 'string', nullable: true, description: 'Cumpleaños (YYYY-MM-DD)' },
      },
    },
  })
  updateMe(
    @CurrentUser() user: any,
    @Body()
    body: {
      displayName?: string;
      timezone?: string;
      latitude?: number | null;
      longitude?: number | null;
      birthday?: string | null;
    },
  ) {
    return this.usersService.updateMe(user.id, body);
  }
}
