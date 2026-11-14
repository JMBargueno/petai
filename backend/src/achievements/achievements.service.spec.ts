import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';

const DEFS = [
  { id: 'care_feed_10', name: 'A', desc: 'A', category: 'care', target: 10, event: 'pet:fed', tier: 'common', reward: { coins: 50, gems: 0, xp: 20, itemId: null } },
  { id: 'battle_10_wins', name: 'B', desc: 'B', category: 'battle', target: 10, event: 'battle_win', tier: 'rare', reward: { coins: 250, gems: 2, xp: 100, itemId: null } },
  { id: 'battle_1_wins', name: 'C', desc: 'C', category: 'battle', target: 1, event: 'battle_win', tier: 'common', reward: { coins: 80, gems: 0, xp: 30, itemId: null } },
];

describe('AchievementsService', () => {
  let service: AchievementsService;
  let prisma: PrismaService;
  const userId = 'user-1';

  beforeEach(async () => {
    const mockPrisma = {
      achievement: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ achievementsPublic: false }),
        update: jest.fn(),
      },
    };
    const mockGame = {
      getAchievements: jest.fn().mockReturnValue({ version: 'v1', achievements: DEFS }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GameDataService, useValue: mockGame },
      ],
    }).compile();
    service = module.get(AchievementsService);
    prisma = module.get(PrismaService);
  });

  describe('getAll', () => {
    it('derives status=locked when a logro has no row (lazy, current 0)', async () => {
      (prisma.achievement.findMany as jest.Mock).mockResolvedValue([]);
      const res = await service.getAll(userId);
      const fed = res.categories.care.find((a) => a.id === 'care_feed_10')!;
      expect(fed.current).toBe(0);
      expect(fed.status).toBe('locked');
      expect(fed.unlockedAt).toBeNull();
      expect(fed.target).toBe(10);
      expect(res.achievementsPublic).toBe(false);
      expect(res.timestamp).toEqual(expect.any(String));
    });

    it('derives status=in_progress when 0 < current < target', async () => {
      (prisma.achievement.findMany as jest.Mock).mockResolvedValue([
        { id: 'r', userId, achId: 'care_feed_10', current: 3, unlockedAt: null, claimed: false },
      ]);
      const res = await service.getAll(userId);
      const fed = res.categories.care.find((a) => a.id === 'care_feed_10')!;
      expect(fed.current).toBe(3);
      expect(fed.status).toBe('in_progress');
    });

    it('derives status=unlocked when current >= target', async () => {
      (prisma.achievement.findMany as jest.Mock).mockResolvedValue([
        { id: 'r', userId, achId: 'battle_10_wins', current: 10, unlockedAt: new Date(), claimed: true },
      ]);
      const res = await service.getAll(userId);
      const w = res.categories.battle.find((a) => a.id === 'battle_10_wins')!;
      expect(w.status).toBe('unlocked');
      expect(w.unlockedAt).toEqual(expect.any(String));
      expect(w.claimed).toBe(true);
    });

    it('groups logros by category and clamps current to target', async () => {
      (prisma.achievement.findMany as jest.Mock).mockResolvedValue([
        { id: 'r', userId, achId: 'battle_1_wins', current: 5, unlockedAt: new Date(), claimed: false },
      ]);
      const res = await service.getAll(userId);
      expect(Object.keys(res.categories)).toEqual(expect.arrayContaining(['care', 'battle', 'ai', 'collection', 'social']));
      const w = res.categories.battle.find((a) => a.id === 'battle_1_wins')!;
      expect(w.current).toBe(1); // clamp to target
    });
  });

  describe('claim', () => {
    it('marks claimed and returns the reward', async () => {
      (prisma.achievement.findUnique as jest.Mock).mockResolvedValue({
        id: 'r', userId, achId: 'battle_10_wins', current: 10, unlockedAt: new Date(), claimed: false,
      });
      const res = await service.claim(userId, 'battle_10_wins');
      expect(res.achievement.claimed).toBe(true);
      expect(res.reward).toEqual({ coins: 250, gems: 2, xp: 100, itemId: null });
      expect(prisma.achievement.updateMany).toHaveBeenCalledWith(
        { where: { userId, achId: 'battle_10_wins', claimed: false }, data: { claimed: true } },
      );
    });

    it('throws 404 when the logro does not exist', async () => {
      await expect(service.claim(userId, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 400 when the logro is not unlocked', async () => {
      (prisma.achievement.findUnique as jest.Mock).mockResolvedValue({
        id: 'r', userId, achId: 'battle_10_wins', current: 2, unlockedAt: null, claimed: false,
      });
      await expect(service.claim(userId, 'battle_10_wins')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 409 when the logro is already claimed', async () => {
      (prisma.achievement.findUnique as jest.Mock).mockResolvedValue({
        id: 'r', userId, achId: 'battle_10_wins', current: 10, unlockedAt: new Date(), claimed: true,
      });
      await expect(service.claim(userId, 'battle_10_wins')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getPublicAchievements', () => {
    it('exposes nothing when achievementsPublic is false (privacy by default)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: userId, displayName: 'Felpa', achievementsPublic: false });
      const res = await service.getPublicAchievements(userId);
      expect(res.achievementsPublic).toBe(false);
      expect(res.achievements).toEqual([]);
    });

    it('exposes only unlocked logros without current when public', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: userId, displayName: 'Felpa', achievementsPublic: true });
      (prisma.achievement.findMany as jest.Mock).mockResolvedValue([
        { id: 'r', userId, achId: 'battle_10_wins', current: 10, unlockedAt: new Date('2026-11-10T09:15:00.000Z'), claimed: true },
      ]);
      const res = await service.getPublicAchievements(userId);
      expect(res.achievementsPublic).toBe(true);
      expect(res.achievements).toHaveLength(1);
      const a = res.achievements[0];
      expect(a.id).toBe('battle_10_wins');
      expect(a.unlockedAt).toBe('2026-11-10T09:15:00.000Z');
      expect('current' in a).toBe(false); // no progreso
    });

    it('throws 404 for unknown owner', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getPublicAchievements('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setAchievementsPublic', () => {
    it('rejects a non-boolean value with 400', async () => {
      await expect(service.setAchievementsPublic(userId, 'yes' as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists the new value', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ achievementsPublic: false });
      (prisma.user.update as jest.Mock).mockResolvedValue({ achievementsPublic: true });
      const res = await service.setAchievementsPublic(userId, true);
      expect(res.achievementsPublic).toBe(true);
    });
  });
});
