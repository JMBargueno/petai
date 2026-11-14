import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { ACHIEVEMENT_CATEGORIES } from '../modules/game-data/game-data.schemas';
import { ConstellationResponseDto, StarDto } from './dto/achievement.dto';

/**
 * Layout SVG de constelaciones por categoría (feature 008 / US4). Cruza el layout data-driven de
 * `constellations.json` con el estado de cada logro del usuario para servir las estrellas
 * (coordenadas + status) y las conexiones que la UI necesita para renderizar.
 */
@Injectable()
export class ConstellationService {
  private readonly logger = new Logger(ConstellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  /**
   * GET /achievements/constellation/:cat — Layout de la constelación de una categoría con el
   * estado de cada estrella. Errores: 400 (categoría inválida), 500 (game-data no cargado).
   */
  async getConstellation(userId: string, cat: string): Promise<ConstellationResponseDto> {
    if (!ACHIEVEMENT_CATEGORIES.includes(cat as (typeof ACHIEVEMENT_CATEGORIES)[number])) {
      throw new BadRequestException(`Categoría inválida: ${cat}. Válidas: ${ACHIEVEMENT_CATEGORIES.join(', ')}`);
    }

    const constellations = this.gameData.getConstellations();
    if (!constellations || !constellations.categories) {
      this.logger.error('Game-data de constelaciones no cargado');
      throw new BadRequestException('Constelaciones no disponibles');
    }

    const layout = constellations.categories[cat];
    if (!layout) {
      throw new BadRequestException(`No hay constelación para la categoría ${cat}`);
    }

    // Estado por logro del usuario (mismo criterio que `AchievementsService.getAll`).
    const defs = this.gameData.getAchievements()?.achievements ?? [];
    const defsById = new Map(defs.map((d: any) => [d.id, d]));
    const rows = await this.prisma.achievement.findMany({
      where: { userId },
      select: { achId: true, current: true, unlockedAt: true },
    });
    const rowsById = new Map(rows.map((r) => [r.achId, r]));

    const stars: StarDto[] = [];
    const starsLayout = (layout.stars ?? {}) as Record<string, { x: number; y: number }>;
    for (const [achId, coords] of Object.entries(starsLayout)) {
      const def = defsById.get(achId) as { name?: string; tier?: string; target?: number } | undefined;
      const row = rowsById.get(achId);
      const current = row?.current ?? 0;
      const target = def?.target ?? 0;
      const status = this.computeStatus(current, target, row?.unlockedAt ?? null);
      stars.push({
        id: achId,
        x: coords.x,
        y: coords.y,
        status,
        name: def?.name ?? achId,
        tier: def?.tier ?? 'common',
      });
    }

    return {
      category: cat,
      name: layout.name,
      stars,
      connections: layout.connections ?? [],
    };
  }

  private computeStatus(current: number, target: number, unlockedAt: Date | null): 'locked' | 'in_progress' | 'unlocked' {
    if (unlockedAt || target > 0 && current >= target) return 'unlocked';
    if (current === 0) return 'locked';
    return 'in_progress';
  }
}
