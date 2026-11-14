import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SeasonRewardsService } from './season-rewards.service';
import { WalletService } from '../wallet/wallet.service';

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
  private seasonsData: SeasonsData;
  private allTiers: TierConfig[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardsService: SeasonRewardsService,
    private readonly wallet: WalletService,
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

    const progress = await this.prisma.seasonProgress.upsert({
      where: { userId_seasonId: { userId, seasonId: cs.id } },
      update: { totalXp: { increment: xp } },
      create: { userId, seasonId: cs.id, totalXp: xp },
    });

    const newTier = Math.min(Math.floor(progress.totalXp / cs.xpPerTier), cs.maxTier);
    if (newTier > progress.currentTier) {
      await this.prisma.seasonProgress.update({
        where: { id: progress.id },
        data: { currentTier: newTier },
      });
      await this.rewardsService.grantTierRewards(userId, cs.id, progress.currentTier + 1, newTier);
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