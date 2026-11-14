import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CookingService } from './cooking.service';

@ApiTags('Cooking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cooking')
export class CookingController {
  constructor(private readonly cookingService: CookingService) {}

  @Post('start')
  @ApiOperation({ summary: 'Iniciar sesión de cocina (receta + ingredientes + timer)' })
  start(@CurrentUser() user: any, @Body() body: { petId: string }) {
    return this.cookingService.start(user.id, body?.petId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Enviar resultado de la sesión de cocina' })
  submit(@CurrentUser() user: any, @Body() body: { sessionId: string; score: number; correctOrder: boolean }) {
    return this.cookingService.submit(user.id, body?.sessionId, body?.score, body?.correctOrder);
  }

  @Get('daily-menu')
  @ApiOperation({ summary: 'Receta especial del día (determinista por fecha)' })
  dailyMenu(@CurrentUser() user: any) {
    return this.cookingService.dailyMenu(user.id);
  }
}