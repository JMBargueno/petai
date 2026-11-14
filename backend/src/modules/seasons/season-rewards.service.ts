import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RewardEntry {
  type: string;
  value: number | string;
}

@Injectable()
export class SeasonRewardsService {
  private readonly logger = new Logger(SeasonRewardsService.name);
  private seasonsData;
  private allTiers: { tier: number; freeRewards: { type: string; value: number | string }[]; premiumRewards: { type: string; value: number | string }[] }[];

  constructor(private readonly prisma: PrismaService) {
    this.seasonsData = require('../../../../shared/game-data/seasons.json');
    this.allTiers = [
      ...this.seasonsData.tiers,
      ...(this.seasonsData.tiers2 || []),
    ];
  }

  async grantTierRewards(
    userId: string,
    seasonId: string,
    fromTier: number,
    toTier: number,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const hasPass = await this.prisma.seasonPass.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });

    let totalCoins = 0;
    let totalGems = 0;
    const items: string[] = [];

    for (let tier = fromTier; tier <= toTier; tier++) {
      const tierConfig = this.allTiers.find((t) => t.tier === tier);
      if (!tierConfig) continue;

      for (const reward of tierConfig.freeRewards) {
        this.applyReward(reward, { coins: totalCoins, gems: totalGems, items });
      }

      if (hasPass) {
        for (const reward of tierConfig.premiumRewards) {
          this.applyReward(reward, { coins: totalCoins, gems: totalGems, items });
        }
      }
    }

    if (totalCoins > 0 || totalGems > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          coins: totalCoins > 0 ? { increment: totalCoins } : undefined,
          gems: totalGems > 0 ? { increment: totalGems } : undefined,
        },
      });
    }

    this.logger.log(
      `Season rewards granted: user=${userId} tiers=${fromTier}-${toTier} coins=+${totalCoins} gems=+${totalGems} items=[${items.join(',')}]`,
    );

    return { coins: totalCoins, gems: totalGems, items };
  }

  private applyReward(
    reward: RewardEntry,
    accumulator: { coins: number; gems: number; items: string[] },
  ) {
    switch (reward.type) {
      case 'coins':
        accumulator.coins += Number(reward.value);
        break;
      case 'gems':
        accumulator.gems += Number(reward.value);
        break;
      case 'item':
        accumulator.items.push(String(reward.value));
        break;
    }
  }
}
