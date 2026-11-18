import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';

@ApiTags('Mind')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MindController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    private readonly memory: MindMemoryService,
  ) {}

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
        where: { petId: pet.id, layer: 'episodic', kind: { in: ['event', 'encounter'] } },
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
      bondingTier: profile.bondingTier,
      intelligenceTier: profile.intelligenceTier,
      memory: { counts, capacity },
      recentLife: recent,
    };
  }
}
