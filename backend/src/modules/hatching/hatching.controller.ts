import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Eclosionar huevo completado' })
  hatchEgg(@CurrentUser() user: any, @Param('id') eggId: string) {
    return this.hatchingService.hatchEgg(user.id, eggId);
  }
}
