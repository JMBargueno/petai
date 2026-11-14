import { Test, TestingModule } from '@nestjs/testing';
import { AchievementTrackingService } from './achievement-tracking.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';
import { RedisService } from '../redis/redis.service';
import { AchievementRewardsService } from './achievement-rewards.service';

const DEFS = [
  { id: 'care_feed_5', target: 5, event: 'pet:fed' },
  { id: 'battle_5_fights', target: 5, event: 'battle:finished' },
  { id: 'battle_1_win', target: 1, event: 'battle_win' },
];

describe('AchievementTrackingService', () => {
  let service: AchievementTrackingService;
  let prisma: PrismaService;
  let redis: RedisService;
  let rewards: AchievementRewardsService;
  const userId = 'user-1';

  beforeEach(async () => {
    const mockPrisma = {
      achievement: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ current: 1 }),
      },
    };
    const mockGame = { getAchievements: jest.fn().mockReturnValue({ version: 'v1', achievements: DEFS }) };
    const mockRedis = { run: jest.fn() };
    const mockRewards = {
      unlockAndGrant: jest.fn().mockResolvedValue({ id: 'care_feed_5', name: 'C', category: 'care', tier: 'common', reward: { coins: 0, gems: 0, xp: 0, itemId: null } }),
      emitUnlocked: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementTrackingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GameDataService, useValue: mockGame },
        { provide: RedisService, useValue: mockRedis },
        { provide: AchievementRewardsService, useValue: mockRewards },
      ],
    }).compile();
    service = module.get(AchievementTrackingService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    rewards = module.get(AchievementRewardsService);
  });

  it('pet:fed increments the matching logro and unlocks when target is reached', async () => {
    // Redis disponible: INCRBY devuelve 5 (== target). GET (flush) devuelve '5'.
    (redis.run as jest.Mock).mockImplementation((_fn, command) => {
      if (command === 'incrby') return Promise.resolve(5);
      if (command === 'get') return Promise.resolve('5');
      return Promise.resolve(null);
    });
    await service.onPetFed({ userId });
    expect(rewards.unlockAndGrant).toHaveBeenCalledWith(userId, 'care_feed_5');
    expect(rewards.emitUnlocked).toHaveBeenCalledWith(userId, expect.objectContaining({ id: 'care_feed_5' }));
  });

  it('battle:finished with won=true advances BOTH battle and battle_win (fallback PG)', async () => {
    // Redis caído: run devuelve null → fallback a PostgreSQL (upsert por logro).
    (redis.run as jest.Mock).mockResolvedValue(null);
    (prisma.achievement.upsert as jest.Mock).mockResolvedValue({ current: 2 });
    await service.onBattleFinished({ userId, won: true });
    expect(prisma.achievement.upsert).toHaveBeenCalledTimes(2);
  });

  it('battle:finished without a win only advances the battle logro', async () => {
    (redis.run as jest.Mock).mockResolvedValue(null);
    (prisma.achievement.upsert as jest.Mock).mockResolvedValue({ current: 2 });
    await service.onBattleFinished({ userId, won: false });
    expect(prisma.achievement.upsert).toHaveBeenCalledTimes(1);
  });

  it('ignores an already-reached logro (no over-count)', async () => {
    (prisma.achievement.findUnique as jest.Mock).mockResolvedValue({ current: 5, unlockedAt: null });
    await service.onPetFed({ userId });
    expect(redis.run).not.toHaveBeenCalled();
    expect(rewards.unlockAndGrant).not.toHaveBeenCalled();
  });

  it('ignores an already-unlocked logro', async () => {
    (prisma.achievement.findUnique as jest.Mock).mockResolvedValue({ current: 2, unlockedAt: new Date() });
    await service.onPetFed({ userId });
    expect(redis.run).not.toHaveBeenCalled();
    expect(rewards.unlockAndGrant).not.toHaveBeenCalled();
  });

  it('does not emit when unlockAndGrant reports already-unlocked (idempotent)', async () => {
    (redis.run as jest.Mock).mockImplementation((_fn, command) => (command === 'incrby' ? Promise.resolve(5) : command === 'get' ? Promise.resolve('5') : Promise.resolve(null)));
    (rewards.unlockAndGrant as jest.Mock).mockResolvedValue(null);
    await service.onPetFed({ userId });
    expect(rewards.emitUnlocked).not.toHaveBeenCalled();
  });
});
