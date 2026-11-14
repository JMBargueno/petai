import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { ACHIEVEMENT_CATEGORY_VALUES } from './dto/achievement.dto';
import {
  AchievementDto,
  AchievementListResponseDto,
  ClaimRewardResponseDto,
  PublicAchievementDto,
  PublicAchievementsDto,
} from './dto/achievement.dto';

interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  category: string;
  target: number;
  event: string;
  tier: string;
  reward: { coins: number; gems: number; xp: number; itemId: string | null };
}

interface AchievementRow {
  id: string;
  userId: string;
  achId: string;
  current: number;
  unlockedAt: Date | null;
  claimed: boolean;
}

/**
 * Servicio principal de logros (feature 008): lectura del panel de logros, constelaciones,
 * claim de recompensa y perfil público. Toda la lógica data-driven proviene de
 * `GameDataService.getAchievements()` / `getConstellations()`.
 */
@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  /** Lista de definiciones de logros vigentes (snapshot de `achievements.json`). */
  private getDefs(): AchievementDef[] {
    const data = this.gameData.getAchievements();
    if (!data || !Array.isArray(data.achievements)) {
      this.logger.warn('Game-data de logros no cargado');
      return [];
    }
    return data.achievements as AchievementDef[];
  }

  /** Estado derivado de un logro a partir de `current`, `target` y `unlockedAt`. */
  private computeStatus(current: number, target: number, unlockedAt: Date | null): 'locked' | 'in_progress' | 'unlocked' {
    if (unlockedAt || current >= target) return 'unlocked';
    if (current === 0) return 'locked';
    return 'in_progress';
  }

  /**
   * GET /achievements — Todos los logros del usuario con su estado, agrupados por categoría.
   *
   * Lazy-init (T013): si el usuario no tiene filas `Achievement` para un logro, se deriva su estado
   * directamente desde `achievements.json` (`current: 0`) sin insertar filas innecesarias.
   */
  async getAll(userId: string): Promise<AchievementListResponseDto> {
    const defs = this.getDefs();
    const rows = await this.prisma.achievement.findMany({ where: { userId } });
    const rowByAchId = new Map<string, AchievementRow>(rows.map((r) => [r.achId, r]));

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { achievementsPublic: true },
    });

    const categories: Record<string, AchievementDto[]> = {};
    for (const cat of ACHIEVEMENT_CATEGORY_VALUES) categories[cat] = [];

    for (const def of defs) {
      const row = rowByAchId.get(def.id);
      const current = row?.current ?? 0;
      const unlockedAt = row?.unlockedAt ?? null;
      const claimed = row?.claimed ?? false;
      const status = this.computeStatus(current, def.target, unlockedAt);
      categories[def.category].push(this.toDto(def, current, status, unlockedAt, claimed));
    }

    return {
      timestamp: new Date().toISOString(),
      achievementsPublic: user?.achievementsPublic ?? false,
      categories,
    };
  }

  private toDto(
    def: AchievementDef,
    current: number,
    status: 'locked' | 'in_progress' | 'unlocked',
    unlockedAt: Date | null,
    claimed: boolean,
  ): AchievementDto {
    return {
      id: def.id,
      category: def.category,
      name: def.name,
      description: def.desc,
      tier: def.tier,
      target: def.target,
      current: Math.min(current, def.target),
      status,
      unlockedAt: unlockedAt ? unlockedAt.toISOString() : null,
      claimed,
      reward: def.reward,
    };
  }

  /**
   * POST /achievements/:id/claim — Marca el logro como reclamado.
   * El desbloqueo acredita la recompensa automáticamente (US3); `claim` expone/fixa el estado
   * `claimed`. Errores: 404 (logro no existe o no pertenece al usuario), 400 (no desbloqueado),
   * 409 (ya reclamado — race condition).
   */
  async claim(userId: string, achId: string): Promise<ClaimRewardResponseDto> {
    const def = this.getDefs().find((d) => d.id === achId);
    if (!def) {
      throw new NotFoundException('Logro no encontrado');
    }

    const row = await this.prisma.achievement.findUnique({
      where: { userId_achId: { userId, achId } },
    });
    if (!row) {
      throw new NotFoundException('Logro no encontrado');
    }
    if (!row.unlockedAt) {
      throw new BadRequestException('El logro aún no está desbloqueado');
    }
    if (row.claimed) {
      throw new ConflictException('El logro ya fue reclamado');
    }

    // Marca reclamado de forma idempotente (solo si aún no lo está).
    const updated = await this.prisma.achievement.updateMany({
      where: { userId, achId, claimed: false },
      data: { claimed: true },
    });
    if (updated.count === 0) {
      throw new ConflictException('El logro ya fue reclamado');
    }

    return {
      achievement: { id: def.id, category: def.category, claimed: true },
      reward: def.reward,
    };
  }

  /**
   * Perfil público de logros (US5). Solo expone logros `unlocked` y nunca el `current` de los que
   * no lo están. Si `achievementsPublic` es `false` (privacidad por defecto), se devuelven cero
   * logros.
   */
  async getPublicAchievements(ownerId: string): Promise<PublicAchievementsDto> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, displayName: true, achievementsPublic: true },
    });
    if (!owner) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!owner.achievementsPublic) {
      return {
        userId: owner.id,
        displayName: owner.displayName,
        achievementsPublic: false,
        achievements: [],
      };
    }

    const defs = this.getDefs();
    const defsById = new Map(defs.map((d) => [d.id, d]));
    const rows = await this.prisma.achievement.findMany({
      where: { userId: ownerId, unlockedAt: { not: null } },
    });

    const achievements: PublicAchievementDto[] = [];
    for (const row of rows) {
      const def = defsById.get(row.achId);
      if (!def) continue;
      achievements.push({
        id: def.id,
        name: def.name,
        category: def.category,
        tier: def.tier,
        unlockedAt: row.unlockedAt?.toISOString() ?? null,
        reward: def.reward,
      });
    }

    return {
      userId: owner.id,
      displayName: owner.displayName,
      achievementsPublic: true,
      achievements,
    };
  }

  /**
   * Marca la visibilidad pública de logros del usuario y devuelve el nuevo valor.
   * Errores: 400 si `value` no es booleano.
   */
  async setAchievementsPublic(userId: string, value: boolean): Promise<{ achievementsPublic: boolean }> {
    if (typeof value !== 'boolean') {
      throw new BadRequestException('achievementsPublic debe ser un booleano');
    }
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { achievementsPublic: true },
    });
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { achievementsPublic: value },
      select: { achievementsPublic: true },
    });
    if (value && current && current.achievementsPublic === false) {
      this.logger.debug(`Visibilidad pública activada para usuario ${userId}`);
    }
    return { achievementsPublic: updated.achievementsPublic };
  }
}
