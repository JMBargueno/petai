import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
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
  @ApiBody({
    schema: {
      type: 'object',
      required: ['petId'],
      properties: {
        petId: { type: 'string', description: 'Pet que cocina' },
      },
    },
  })
  start(@CurrentUser() user: any, @Body() body: { petId: string }) {
    return this.cookingService.start(user.id, body?.petId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Enviar resultado de la sesión de cocina' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sessionId', 'score', 'correctOrder'],
      properties: {
        sessionId: { type: 'string', description: 'ID de la sesión de cocina' },
        score: { type: 'number', description: 'Puntuación obtenida' },
        correctOrder: { type: 'boolean', description: 'Si el orden de los pasos fue correcto' },
      },
    },
  })
  submit(@CurrentUser() user: any, @Body() body: { sessionId: string; score: number; correctOrder: boolean }) {
    return this.cookingService.submit(user.id, body?.sessionId, body?.score, body?.correctOrder);
  }

  @Get('daily-menu')
  @ApiOperation({ summary: 'Receta especial del día (determinista por fecha)' })
  dailyMenu(@CurrentUser() user: any) {
    return this.cookingService.dailyMenu(user.id);
  }
}