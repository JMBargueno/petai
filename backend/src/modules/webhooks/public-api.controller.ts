import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyGuard, RequireScope } from './api-key.guard';

/**
 * PublicApiController — Feature 025. Endpoints públicos autenticados por API key.
 * Son stateless y de lectura; el scope se verifica en el `ApiKeyGuard`.
 */
@ApiTags('Public API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('v1/public')
export class PublicApiController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leaderboard')
  @RequireScope('read:leaderboard')
  @ApiOperation({ summary: 'Top 100 del leaderboard (opcional por elemento)' })
  @ApiResponse({ status: 200, description: 'Leaderboard' })
  async leaderboard(@Query('element') element?: string, @Query('top') top?: string) {
    const limit = Math.min(100, Math.max(1, Number(top) || 100));
    const where: Record<string, unknown> = {};
    if (element) {
      where.species = { element };
    }

    const pets = await this.prisma.pet.findMany({
      where,
      orderBy: { elo: 'desc' },
      take: limit,
      include: { species: true, user: { select: { displayName: true } } },
    });

    return {
      element: element ?? null,
      limit,
      entries: pets.map((p, i) => ({
        rank: i + 1,
        petId: p.id,
        nickname: p.nickname,
        element: p.species?.element ?? null,
        rarity: p.rarity,
        level: p.level,
        elo: p.elo,
        owner: p.user?.displayName ?? null,
      })),
    };
  }

  @Get('events')
  @RequireScope('read:events')
  @ApiOperation({ summary: 'Eventos globales activos (raid, temporada, torneos)' })
  @ApiResponse({ status: 200, description: 'Eventos globales' })
  async events() {
    const now = new Date();
    const [season, raid, tournament] = await Promise.all([
      this.prisma.season.findFirst({ where: { isActive: true } }).catch(() => null),
      this.prisma.raid.findMany({ where: { startedAt: { lte: now } } }).catch(() => []),
      this.prisma.tournament.findMany({ where: { status: 'active' } }).catch(() => []),
    ]);

    return {
      generatedAt: now,
      seasons: season ? [{ id: season.id, name: season.name, theme: season.theme }] : [],
      raids: raid.map((r) => ({ id: r.id, startedAt: r.startedAt })),
      tournaments: tournament.map((t) => ({ id: t.id, status: t.status })),
    };
  }

  @Get('pets/:petId')
  @RequireScope('read:pets')
  @ApiOperation({ summary: 'Pet público (solo si es opt-in) — stats básicas' })
  @ApiResponse({ status: 200, description: 'Datos públicos del pet' })
  @ApiResponse({ status: 404, description: 'Pet no público o no encontrado' })
  async pet(@Param('petId') petId: string) {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: { species: true },
    });
    if (!pet) throw new NotFoundException('Pet no encontrado');

    // El pet solo es visible si su dueño lo marcó público (opt-in). Se infiere de la
    // configuración de visibilidad del user cuando existe; por defecto: privado.
    const user = await this.prisma.user.findUnique({ where: { id: pet.userId } });
    const isPublic = (user?.notificationPrefs as Record<string, unknown> | null)?.publicPets === true;
    if (!isPublic) {
      throw new NotFoundException('El pet no es público');
    }

    return {
      petId: pet.id,
      nickname: pet.nickname,
      element: pet.species?.element ?? null,
      rarity: pet.rarity,
      level: pet.level,
      elo: pet.elo,
      shiny: pet.shiny,
    };
  }
}
