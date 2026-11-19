import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
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
        recipeId: { type: 'string', description: 'Receta a cocinar. Si falta, el menú del día' },
      },
    },
  })
  start(@CurrentUser() user: any, @Body() body: { petId: string; recipeId?: string }) {
    return this.cookingService.start(user.id, body?.petId, body?.recipeId);
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
        picked: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ingredientes echados a la olla, en orden. Si se envía, el servidor cuenta los aciertos y no usa score ni correctOrder',
        },
        pickedAt: {
          type: 'array',
          items: { type: 'number' },
          description: 'Ms desde que empezó a cocinar en que se echó cada ingrediente de picked (olla caliente)',
        },
      },
    },
  })
  submit(@CurrentUser() user: any, @Body() body: { sessionId: string; score: number; correctOrder: boolean; picked?: string[]; pickedAt?: number[] }) {
    return this.cookingService.submit(user.id, body?.sessionId, body?.score, body?.correctOrder, body?.picked, body?.pickedAt);
  }

  @Get('recipes')
  @ApiOperation({ summary: 'Recetario: recetas, si se pueden cocinar con la mascota y la mejor nota' })
  @ApiQuery({ name: 'petId', required: true })
  recipes(@CurrentUser() user: any, @Query('petId') petId: string) {
    return this.cookingService.recipeBook(user.id, petId);
  }

  @Get('buffs')
  @ApiOperation({ summary: 'Buffs de comida activos de una mascota' })
  @ApiQuery({ name: 'petId', required: true })
  buffs(@CurrentUser() user: any, @Query('petId') petId: string) {
    return this.cookingService.activeBuffs(user.id, petId);
  }

  @Get('daily-menu')
  @ApiOperation({ summary: 'Menú del día: una receta propia por día de la semana (UTC), con el buff ×1.5' })
  dailyMenu(@CurrentUser() user: any) {
    return this.cookingService.dailyMenu(user.id);
  }
}