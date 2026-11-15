import { Body, Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { HatchingService } from './hatching.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Eggs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('eggs')
export class HatchingController {
  constructor(private readonly hatchingService: HatchingService) {}

  @Get()
  @ApiOperation({ summary: 'Listar huevos del usuario en incubación' })
  getEggs(@CurrentUser() user: any) {
    return this.hatchingService.getEggs(user.id);
  }

  @Post('buy')
  @ApiOperation({ summary: 'Comprar un nuevo huevo estándar' })
  buyEgg(@CurrentUser() user: any) {
    return this.hatchingService.buyEgg(user.id);
  }

  @Post(':id/hatch')
  @ApiOperation({ summary: 'Eclosionar huevo completado (nombre opcional de la mascota)' })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        nickname: {
          type: 'string',
          maxLength: 16,
          description: 'Nombre de la mascota (trim 1-16). Si se omite o queda vacío, se asigna uno aleatorio.',
        },
      },
    },
  })
  hatchEgg(@CurrentUser() user: any, @Param('id') eggId: string, @Body() body: unknown) {
    const nickname = (body as { nickname?: unknown } | null | undefined)?.nickname;
    return this.hatchingService.hatchEgg(user.id, eggId, typeof nickname === 'string' ? nickname : undefined);
  }
}
