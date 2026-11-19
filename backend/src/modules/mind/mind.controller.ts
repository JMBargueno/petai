import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';
import { InitiativeService } from './initiative.service';

@ApiTags('Mind')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MindController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    private readonly memory: MindMemoryService,
    private readonly initiative: InitiativeService,
  ) {}

  @Post('pets/:id/initiative')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '¿Tiene el Pockai algo que decir por su cuenta?',
    description:
      'Lo decide el servidor: según el nivel de insistencia elegido, el carácter de la mascota, su ánimo, lo que necesita o le apetece y ' +
      'lo que sabe de su entrenador. Devuelve una frase ya escrita (o ninguna) y cuándo volver a preguntar. El cliente solo la muestra. ' +
      '`back: true` avisa de que el entrenador acaba de volver tras un rato fuera; `focus: true`, de que está concentrado y no hay que interrumpir.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channel'],
      properties: {
        channel: { type: 'string', enum: ['desktop', 'mobile'] },
        back: { type: 'boolean', description: 'El entrenador acaba de volver' },
        focus: { type: 'boolean', description: 'El entrenador está concentrado (Pomodoro, pantalla completa)' },
      },
    },
  })
  speak(@CurrentUser() user: any, @Param('id') petId: string, @Body() body: { channel?: string; back?: boolean; focus?: boolean }) {
    return this.initiative.speak(user.id, petId, { channel: body?.channel, back: body?.back === true, focus: body?.focus === true });
  }

  @Get('pets/:id/initiative/settings')
  @ApiOperation({ summary: 'Cuánto puede interrumpir el Pockai: nivel elegido y niveles disponibles' })
  initiativeSettings(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.initiative.settings(user.id, petId);
  }

  @Put('pets/:id/initiative/settings')
  @ApiOperation({ summary: 'Elegir cuánto puede interrumpir el Pockai (quiet | normal | chatty)' })
  @ApiBody({ schema: { type: 'object', required: ['level'], properties: { level: { type: 'string', enum: ['quiet', 'normal', 'chatty'] } } } })
  setInitiativeLevel(@CurrentUser() user: any, @Param('id') petId: string, @Body() body: { level?: string }) {
    return this.initiative.setLevel(user.id, petId, body?.level);
  }

  @Get('pets/:id/mind')
  @ApiOperation({ summary: 'Perfil de criatura: 5 dimensiones de personalidad, keywords, memoria por capas y vida autónoma reciente' })
  async profile(@CurrentUser() user: any, @Param('id') petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId: user.id }, include: { species: true } });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    const profile = await this.mind.profile(pet);
    const [counts, capacity, recent] = await Promise.all([
      this.memory.counts(pet.id),
      this.memory.capacity(pet.id),
      this.prisma.petMemory.findMany({
        where: { petId: pet.id, layer: 'episodic', kind: { in: ['event', 'encounter', 'find', 'visit', 'rumor'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, kind: true, content: true, createdAt: true },
      }),
    ]);
    return {
      petId: pet.id,
      dimensions: profile.traits,
      legacy: profile.legacy,
      mood: profile.mood,
      // Ánimo de corto plazo: lo que le acaba de pasar (los clientes lo usan para el tono y las conductas)
      feeling: profile.feeling,
      bondingTier: profile.bondingTier,
      intelligenceTier: profile.intelligenceTier,
      memory: { counts, capacity },
      recentLife: recent,
    };
  }
}
