import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaderboardService } from '../battles/leaderboard.service';
import { GameDataService } from '../game-data/game-data.service';
import { ApiKeyGuard, RequireScope } from './api-key.guard';

/**
 * PublicApiController — Feature 025. Endpoints públicos autenticados por API key.
 * Son stateless y de lectura; el scope se verifica en el `ApiKeyGuard`.
 */
@ApiTags('Public API')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('public')
export class PublicApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboardService: LeaderboardService,
    private readonly gameData: GameDataService,
  ) {}

  @Get('leaderboard')
  @RequireScope('read:leaderboard')
  @ApiOperation({ summary: 'Top del leaderboard (opcional por elemento), servido desde el ZSET' })
  @ApiResponse({ status: 200, description: 'Leaderboard' })
  async leaderboard(@Query('element') element?: string, @Query('top') top?: string) {
    // R-04: reutiliza la clasificación del núcleo (ZSET) en vez de ordenar Pet por ELO con include.
    const max = this.gameData.getBalance().publicApi?.leaderboardMax ?? 100;
    const limit = Math.min(max, Math.max(1, Number(top) || max));
    const entries = await this.leaderboardService.publicTop(limit, element);

    return { element: element ?? null, limit, entries };
  }

  @Get('events')
  @RequireScope('read:events')
  @ApiOperation({ summary: 'Eventos globales activos (raid, temporada, torneos)' })
  @ApiResponse({ status: 200, description: 'Eventos globales' })
  async events() {
    const now = new Date();
    const eventsLimit = Math.max(1, Math.floor(this.gameData.getBalance().publicApi?.eventsLimit ?? 10));
    const [season, raid, tournament] = await Promise.all([
      this.prisma.season.findFirst({ where: { isActive: true } }).catch(() => null),
      // R-04: solo raids en curso (estado activo y no finalizadas) con un tope razonable,
      // no todos los raids históricos.
      this.prisma.raid
        .findMany({ where: { status: 'active', endsAt: { gte: now } }, orderBy: { startedAt: 'desc' }, take: eventsLimit })
        .catch(() => []),
      this.prisma.tournament.findMany({ where: { status: 'active' }, take: eventsLimit }).catch(() => []),
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
