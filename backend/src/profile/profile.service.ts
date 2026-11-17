import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { AchievementEngineService } from '../achievements/achievement-engine.service';
import { MyProfileDto, ProfileBadgeDto, ProfileBaseDto, ProfileStatsDto, PublicProfileDto } from './dto/profile.dto';

export const MAX_FEATURED_BADGES = 3;
const RARITIES = ['normal', 'rare', 'super_rare', 'legendary', 'mythic'];

/**
 * Perfil social (pestaña Social › Mi Perfil y perfil de otros jugadores): datos de la cuenta, mascota
 * principal, estadísticas e insignias (logros desbloqueados). En el perfil público solo se exponen
 * datos no sensibles (sin email, saldo ni detalles de facturación) y, si el dueño oculta sus
 * insignias (`achievementsPublic = false`), tampoco estadísticas ni insignias.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
    private readonly engine: AchievementEngineService,
  ) {}

  async getMyProfile(userId: string): Promise<MyProfileDto> {
    // Evaluación al abrir el perfil: lo que se muestra ya incluye cualquier logro recién cumplido.
    const ctx = await this.engine.loadContext(userId);
    await this.engine.evaluate(userId, ctx);
    const pro = await this.stats.getProInfo(userId);
    const base = await this.buildBase(userId, ctx.stats, pro.active, true, true);
    return { ...base, proSince: pro.since ? pro.since.toISOString() : null };
  }

  async getPublicProfile(viewerId: string, targetId: string): Promise<PublicProfileDto> {
    if (typeof targetId !== 'string' || targetId.length > 64) throw new NotFoundException('Usuario no encontrado');
    const isSelf = viewerId === targetId;
    const exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { achievementsPublic: true } });
    if (!exists) throw new NotFoundException('Usuario no encontrado');
    const showDetails = isSelf || exists.achievementsPublic;
    const [stats, pro, isFriend] = await Promise.all([
      showDetails ? this.stats.getAll(targetId) : Promise.resolve({} as Record<string, number>),
      this.stats.getProInfo(targetId),
      isSelf ? Promise.resolve(false) : this.areFriends(viewerId, targetId),
    ]);
    const base = await this.buildBase(targetId, stats, pro.active, showDetails, false);
    return { ...base, isFriend, isSelf };
  }

  /** Fija la vitrina (máx. 3 insignias). Solo se pueden destacar logros desbloqueados. */
  async setFeaturedBadges(userId: string, body: unknown): Promise<{ featuredBadges: string[] }> {
    const raw = (body as { achIds?: unknown })?.achIds;
    if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
      throw new BadRequestException('achIds debe ser una lista de ids de logros');
    }
    const ids = [...new Set(raw as string[])];
    if (ids.length > MAX_FEATURED_BADGES) {
      throw new BadRequestException(`Como máximo ${MAX_FEATURED_BADGES} insignias destacadas`);
    }
    if (ids.length > 0) {
      const unlocked = await this.prisma.achievement.findMany({
        where: { userId, achId: { in: ids }, unlockedAt: { not: null } },
        select: { achId: true },
      });
      const ok = new Set(unlocked.map((r) => r.achId));
      const missing = ids.filter((id) => !ok.has(id));
      if (missing.length > 0) throw new BadRequestException(`Insignias no desbloqueadas: ${missing.join(', ')}`);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { featuredBadges: ids },
      select: { featuredBadges: true },
    });
    return { featuredBadges: updated.featuredBadges };
  }

  // ---------- Internos ----------

  private async buildBase(
    userId: string,
    stats: Record<string, number>,
    isPro: boolean,
    showDetails: boolean,
    own: boolean,
  ): Promise<ProfileBaseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        handle: true,
        title: true,
        accountXp: true,
        createdAt: true,
        achievementsPublic: true,
        featuredBadges: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const [pet, unlockedRows] = await Promise.all([
      this.prisma.pet.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          nickname: true,
          rarity: true,
          level: true,
          stage: true,
          shiny: true,
          species: { select: { name: true, element: true } },
        },
      }),
      this.prisma.achievement.findMany({
        where: { userId, unlockedAt: { not: null } },
        select: { achId: true, unlockedAt: true },
        orderBy: { unlockedAt: 'desc' },
      }),
    ]);

    const defs = this.engine.getDefs();
    const defsById = new Map(defs.map((d) => [d.id, d]));
    const badges: ProfileBadgeDto[] = [];
    for (const row of unlockedRows) {
      const def = defsById.get(row.achId);
      if (!def || !row.unlockedAt) continue;
      badges.push({
        id: def.id,
        name: def.name,
        description: def.desc,
        badgeIcon: def.badge?.icon ?? 'star',
        category: def.category,
        tier: def.tier,
        unlockedAt: row.unlockedAt.toISOString(),
      });
    }
    const unlockedIds = new Set(badges.map((b) => b.id));

    return {
      id: user.id,
      displayName: user.displayName,
      handle: user.handle ?? null,
      title: user.title ?? null,
      accountXp: user.accountXp,
      createdAt: user.createdAt.toISOString(),
      isPro,
      achievementsPublic: user.achievementsPublic,
      pet: pet
        ? {
            id: pet.id,
            nickname: pet.nickname,
            speciesName: pet.species.name,
            element: pet.species.element,
            rarity: pet.rarity,
            level: pet.level,
            stage: pet.stage,
            shiny: pet.shiny,
          }
        : null,
      stats: showDetails ? this.toStatsDto(stats, own) : null,
      badges: showDetails ? badges : [],
      featuredBadges: showDetails ? (user.featuredBadges ?? []).filter((id) => unlockedIds.has(id)) : [],
      achievementCount: { unlocked: showDetails ? badges.length : 0, total: defs.length },
    };
  }

  private toStatsDto(s: Record<string, number>, own: boolean): ProfileStatsDto {
    const v = (k: string) => s[k] ?? 0;
    const byRarity: Record<string, number> = {};
    for (const r of RARITIES) byRarity[r] = v(`hatched_${r}`);
    const dto: ProfileStatsDto = {
      playMinutes: Math.floor(v('play_seconds') / 60),
      feeds: v('feeds'),
      cleans: v('cleans'),
      sleeps: v('sleeps'),
      eggsHatched: v('eggs_hatched'),
      byRarity,
      shinies: v('hatched_shiny'),
      habitatVisits: v('habitat_visits'),
      friends: v('friends'),
      streakCurrent: v('streak_current'),
      streakBest: v('streak_best'),
      proDays: v('pro_days'),
    };
    if (own) {
      dto.coinsSpent = v('coins_spent');
      dto.gemsSpent = v('gems_spent');
    }
    return dto;
  }

  private async areFriends(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.coopFriendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { ownerId: a, visitorId: b },
          { ownerId: b, visitorId: a },
        ],
      },
      select: { id: true },
    });
    return !!row;
  }
}
