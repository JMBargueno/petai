import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SeasonRewardsService } from './season-rewards.service';
import { WalletService } from '../wallet/wallet.service';
import { RedisCacheService } from '../../redis/redis-cache.service';
import { CronLockService } from '../../redis/cron-lock.service';
import { Cron, CronExpression } from '@nestjs/schedule';

// R-04: vida de la caché de `getProgress` (5–30 s) para datos que cambian poco.
const PROGRESS_TTL_SECONDS = 10;

interface SeasonConfig {
  id: string;
  name: string;
  theme: string;
  startTime: string;
  endTime: string;
  passPrice: number;
  passCurrency: string;
  maxTier: number;
  xpPerTier: number;
}

export interface TierConfig {
  tier: number;
  freeRewards: { type: string; value: number | string }[];
  premiumRewards: { type: string; value: number | string }[];
}

interface SeasonsData {
  currentSeason: SeasonConfig;
  upcomingSeason: SeasonConfig;
  tiers: TierConfig[];
  tiers2?: TierConfig[];
}

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);
  private seasonsData: SeasonsData;
  private allTiers: TierConfig[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardsService: SeasonRewardsService,
    private readonly wallet: WalletService,
    private readonly cache: RedisCacheService,
    private readonly cronLock: CronLockService,
  ) {
    this.seasonsData = require('../../../../shared/game-data/seasons.json');
    this.allTiers = [
      ...this.seasonsData.tiers,
      ...(this.seasonsData.tiers2 || []),
    ];
  }

  async getCurrentSeason() {
    const current = this.seasonsData.currentSeason;
    const now = new Date();
    const endTime = new Date(current.endTime);
    const isExpired = now > endTime;

    return {
      id: current.id,
      name: current.name,
      theme: current.theme,
      startTime: new Date(current.startTime),
      endTime,
      isActive: !isExpired,
      timeRemainingMs: Math.max(0, endTime.getTime() - now.getTime()),
      passPrice: current.passPrice,
      passCurrency: current.passCurrency,
      maxTier: current.maxTier,
      xpPerTier: current.xpPerTier,
      upcoming: this.seasonsData.upcomingSeason
        ? {
            id: this.seasonsData.upcomingSeason.id,
            name: this.seasonsData.upcomingSeason.name,
            theme: this.seasonsData.upcomingSeason.theme,
            startTime: new Date(this.seasonsData.upcomingSeason.startTime),
          }
        : null,
    };
  }

  async getSeasonById(seasonId: string) {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (season) {
      return {
        id: season.id,
        name: season.name,
        theme: season.theme,
        startTime: season.startTime,
        endTime: season.endTime,
        isActive: season.isActive,
        tiers: this.allTiers,
      };
    }
    if (seasonId === this.seasonsData.currentSeason.id) {
      return this.getCurrentSeason();
    }
    if (seasonId === this.seasonsData.upcomingSeason?.id) {
      const up = this.seasonsData.upcomingSeason;
      return {
        id: up.id,
        name: up.name,
        theme: up.theme,
        startTime: new Date(up.startTime),
        endTime: new Date(up.endTime),
        isActive: false,
        upcoming: true,
        tiers: this.allTiers,
      };
    }
    throw new NotFoundException('Season not found: ' + seasonId);
  }

  async purchasePass(userId: string) {
    const cs = this.seasonsData.currentSeason;
    if (new Date() > new Date(cs.endTime)) {
      throw new BadRequestException('Season expired');
    }
    const existing = await this.prisma.seasonPass.findUnique({
      where: { userId_seasonId: { userId, seasonId: cs.id } },
    });
    if (existing) throw new ConflictException('Pass already purchased');

    // S-05 (SDD §3.3): cobro atómico race-safe (C-01) + creación del pase en una sola transacción.
    const pass = await this.prisma.$transaction(async (tx) => {
      // F-11: asegurar la fila Season (FK de SeasonPass/SeasonProgress) antes de crear el pase;
      // si no existía, el `create` del pase fallaría con violación de FK (P2003) tras el débito.
      await tx.season.upsert({
        where: { id: cs.id },
        update: {},
        create: {
          id: cs.id,
          name: cs.name,
          theme: cs.theme,
          startTime: new Date(cs.startTime),
          endTime: new Date(cs.endTime),
          isActive: true,
        },
      });
      const { ok } = await this.wallet.debit(tx, userId, 'gems', cs.passPrice);
      if (!ok) throw new BadRequestException(`Need ${cs.passPrice} gems`);
      const created = await tx.seasonPass.create({
        data: { userId, seasonId: cs.id, price: cs.passPrice },
      });
      await tx.seasonProgress.upsert({
        where: { userId_seasonId: { userId, seasonId: cs.id } },
        update: {},
        create: { userId, seasonId: cs.id, currentTier: 0, totalXp: 0 },
      });
      return created;
    });

    return {
      message: 'Season pass purchased',
      pass: { id: pass.id, seasonId: pass.seasonId, price: pass.price, purchasedAt: pass.purchasedAt },
    };
  }

  async getProgress(userId: string) {
    // R-04: 2 consultas a datos de cambio lento → caché de vida corta por usuario+temporada.
    const cs = this.seasonsData.currentSeason;
    return this.cache.getOrSet(`season:progress:${cs.id}:${userId}`, PROGRESS_TTL_SECONDS, () => this.getProgressComputed(userId));
  }

  private async getProgressComputed(userId: string) {
    const cs = this.seasonsData.currentSeason;
    if (new Date() > new Date(cs.endTime)) {
      return { seasonId: cs.id, currentTier: 0, totalXp: 0, maxTier: cs.maxTier, hasPass: false, unlockedTiers: [], nextReward: this.allTiers[0], seasonExpired: true };
    }

    const progress = await this.prisma.seasonProgress.findUnique({
      where: { userId_seasonId: { userId, seasonId: cs.id } },
    });
    const hasPass = await this.prisma.seasonPass.findUnique({
      where: { userId_seasonId: { userId, seasonId: cs.id } },
    });

    const currentTier = progress?.currentTier ?? 0;
    const totalXp = progress?.totalXp ?? 0;

    return {
      seasonId: cs.id,
      seasonName: cs.name,
      currentTier,
      totalXp,
      xpPerTier: cs.xpPerTier,
      maxTier: cs.maxTier,
      xpToNextTier: currentTier < cs.maxTier ? currentTier * cs.xpPerTier + cs.xpPerTier - totalXp : 0,
      hasPass: !!hasPass,
      unlockedTiers: this.allTiers
        .filter((t) => t.tier <= currentTier)
        .map((t) => ({
          tier: t.tier,
          freeRewards: t.freeRewards,
          premiumRewards: hasPass ? t.premiumRewards : undefined,
        })),
      nextReward: currentTier < cs.maxTier ? this.allTiers.find((t) => t.tier === currentTier + 1) : null,
    };
  }

  async addXp(userId: string, xp: number) {
    const cs = this.seasonsData.currentSeason;
    if (new Date() > new Date(cs.endTime)) return;

    // F-11: avance atómico. Incrementar la XP y "reclamar" el nuevo tier son una sola operación:
    // solo la llamada que sube `currentTier` desde su valor anterior (updateMany condicionado)
    // concede la recompensa, así dos addXp simultáneos no conceden dos veces el mismo nivel.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.seasonProgress.upsert({
        where: { userId_seasonId: { userId, seasonId: cs.id } },
        update: { totalXp: { increment: xp } },
        create: { userId, seasonId: cs.id, totalXp: xp, currentTier: 0 },
      });
      const newTier = Math.min(Math.floor(updated.totalXp / cs.xpPerTier), cs.maxTier);
      if (newTier > updated.currentTier) {
        const claim = await tx.seasonProgress.updateMany({
          where: { id: updated.id, currentTier: updated.currentTier },
          data: { currentTier: newTier },
        });
        if (claim.count === 1) return { from: updated.currentTier + 1, to: newTier };
      }
      return null;
    });

    if (claimed) await this.rewardsService.grantTierRewards(userId, cs.id, claimed.from, claimed.to);
  }

  /**
   * F-11: cierre de temporada idempotente. Voltea `isActive` true→false (única réplica) y, al
   * liquidar, reparte a cada participante un premio de fin de temporada escalado por su tier
   * final (20 monedas por tier; +2 gemas por tier si tiene el pase). Si la temporada era la
   * "current" del config y hay una próxima, activa su fila en BD (rollover).
   */
  async settleSeason(seasonId: string) {
    const claimed = await this.prisma.season.updateMany({
      where: { id: seasonId, isActive: true, endTime: { lte: new Date() } },
      data: { isActive: false },
    });
    if (claimed.count === 0) return { settled: false, distributed: 0 };

    const progress = await this.prisma.seasonProgress.findMany({ where: { seasonId } });
    for (const p of progress) {
      await this.grantSeasonEndReward(p.userId, seasonId, p.currentTier);
    }

    const up = this.seasonsData.upcomingSeason;
    if (up && seasonId === this.seasonsData.currentSeason.id) {
      await this.prisma.season.upsert({
        where: { id: up.id },
        update: {},
        create: {
          id: up.id,
          name: up.name,
          theme: up.theme,
          startTime: new Date(up.startTime),
          endTime: new Date(up.endTime),
          isActive: true,
        },
      });
    }

    this.logger.log(`Season ${seasonId} settled: ${progress.length} end-of-season prizes distributed`);
    return { settled: true, distributed: progress.length };
  }

  /** Premio de fin de temporada por tier final alcanzado (monedas; gemas extra si tiene el pase). */
  private async grantSeasonEndReward(userId: string, seasonId: string, finalTier: number) {
    if (!finalTier || finalTier <= 0) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const hasPass = await this.prisma.seasonPass.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    const coins = finalTier * 20;
    const gems = hasPass ? finalTier * 2 : 0;
    await this.prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: coins }, ...(gems > 0 ? { gems: { increment: gems } } : {}) },
    });
  }

  /**
   * F-11: cron que cierra y liquida las temporadas activas ya pasadas su `endTime`.
   * Solo una réplica ejecuta el ciclo por ventana (CronLockService).
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async settleExpiredSeasons() {
    const token = await this.cronLock.guard('seasons:settle', 300_000);
    if (!token) return;
    try {
      const expired = await this.prisma.season.findMany({
        where: { isActive: true, endTime: { lte: new Date() } },
        select: { id: true },
      });
      for (const s of expired) await this.settleSeason(s.id);
    } catch (err) {
      this.logger.error(`Error liquidando temporadas: ${(err as Error).message}`);
    } finally {
      await this.cronLock.release('seasons:settle', token);
    }
  }

  async ensureSeasonRecord() {
    const current = this.seasonsData.currentSeason;
    const existing = await this.prisma.season.findUnique({ where: { id: current.id } });
    if (!existing) {
      await this.prisma.season.create({
        data: {
          id: current.id,
          name: current.name,
          theme: current.theme,
          startTime: new Date(current.startTime),
          endTime: new Date(current.endTime),
          isActive: true,
        },
      });
    }
    return this.prisma.season.findUniqueOrThrow({ where: { id: current.id } });
  }
}