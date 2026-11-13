import { Test, TestingModule } from '@nestjs/testing';
import { MissionsService } from './missions.service';
import { MissionGenerationService } from './mission-generation.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('MissionsService', () => {
  let service: MissionsService;
  let prisma: PrismaService;
  let generationService: MissionGenerationService;
  let realtimeGateway: RealtimeGateway;
  const userId = 'user-123';
  const timezone = 'America/Mexico_City';
  const dailyMissions = [
    { id: 'd1', period: 'daily', type: 'feed', description: 'Alimenta 2 veces', target: 2, current: 1, completed: false, claimed: false, rewardCoins: 15, rewardGems: 0, rewardXp: 10, periodStart: new Date('2026-11-13T00:00:00Z'), periodEnd: new Date('2026-11-14T00:00:00Z'), createdAt: new Date('2026-11-13T00:00:01Z') },
    { id: 'd2', period: 'daily', type: 'battle', description: 'Juega 1', target: 1, current: 0, completed: false, claimed: false, rewardCoins: 25, rewardGems: 0, rewardXp: 20, periodStart: new Date('2026-11-13T00:00:00Z'), periodEnd: new Date('2026-11-14T00:00:00Z'), createdAt: new Date('2026-11-13T00:00:01Z') },
    { id: 'd3', period: 'daily', type: 'chat', description: 'Envia 5', target: 5, current: 5, completed: true, claimed: false, rewardCoins: 10, rewardGems: 1, rewardXp: 10, periodStart: new Date('2026-11-13T00:00:00Z'), periodEnd: new Date('2026-11-14T00:00:00Z'), createdAt: new Date('2026-11-13T00:00:01Z') },
    { id: 'd4', period: 'daily', type: 'clean', description: 'Limpia 1', target: 1, current: 0, completed: false, claimed: false, rewardCoins: 10, rewardGems: 0, rewardXp: 5, periodStart: new Date('2026-11-13T00:00:00Z'), periodEnd: new Date('2026-11-14T00:00:00Z'), createdAt: new Date('2026-11-13T00:00:01Z') },
  ];
  const weeklyMissions = [
    { id: 'w1', period: 'weekly', type: 'level_up', description: 'Sube 1 pet', target: 1, current: 0, completed: false, claimed: false, rewardCoins: 100, rewardGems: 5, rewardXp: 100, periodStart: new Date('2026-11-10T00:00:00Z'), periodEnd: new Date('2026-11-17T00:00:00Z'), createdAt: new Date('2026-11-10T00:00:01Z') },
  ];
  beforeEach(async () => {
    const mockPrisma = { mission: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() }, user: { update: jest.fn() }, $transaction: jest.fn().mockImplementation((fn) => fn(mockPrisma)) };
    const mockGeneration = { ensureMissionsExist: jest.fn().mockResolvedValue(undefined) };
    const mockRealtime = { emitToUser: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MissionsService, { provide: PrismaService, useValue: mockPrisma }, { provide: MissionGenerationService, useValue: mockGeneration }, { provide: RealtimeGateway, useValue: mockRealtime }],
    }).compile();
    service = module.get(MissionsService);
    prisma = module.get(PrismaService);
    generationService = module.get(MissionGenerationService);
    realtimeGateway = module.get(RealtimeGateway);
  });
  describe('getMissions()', () => {
    it('lazy init: calls ensureMissionsExist', async () => {
      (prisma.mission.findMany as jest.Mock).mockResolvedValue([]);
      await service.getMissions(userId, timezone);
      expect(generationService.ensureMissionsExist).toHaveBeenCalledWith(userId, timezone);
    });
    it('returns daily + weekly with correct format', async () => {
      (prisma.mission.findMany as jest.Mock).mockResolvedValueOnce(dailyMissions).mockResolvedValueOnce(weeklyMissions);
      const r = await service.getMissions(userId, timezone);
      expect(r.daily).toHaveLength(4);
      expect(r.weekly).toHaveLength(1);
      expect(r.daily[0]).toEqual({ id: 'd1', type: 'feed', description: 'Alimenta 2 veces', target: 2, current: 1, completed: false, reward: { coins: 15, gems: 0, xp: 10 }, resetsAt: dailyMissions[0].periodEnd.toISOString() });
    });
    it('dailyChestUnlocked=false when not all completed', async () => {
      (prisma.mission.findMany as jest.Mock).mockResolvedValueOnce(dailyMissions).mockResolvedValueOnce(weeklyMissions);
      expect((await service.getMissions(userId, timezone)).dailyChestUnlocked).toBe(false);
    });
    it('dailyChestUnlocked=true when all completed', async () => {
      (prisma.mission.findMany as jest.Mock).mockResolvedValueOnce(dailyMissions.map(m => ({ ...m, completed: true }))).mockResolvedValueOnce(weeklyMissions);
      expect((await service.getMissions(userId, timezone)).dailyChestUnlocked).toBe(true);
    });
  });
  describe('getSummary()', () => {
    it('returns counts and streaks', async () => {
      (prisma.mission.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValueOnce(4).mockResolvedValueOnce(1).mockResolvedValueOnce(6);
      (prisma.mission.findMany as jest.Mock).mockResolvedValue([]);
      const r = await service.getSummary(userId, timezone);
      expect(r).toEqual({ dailyCompleted: 3, dailyTotal: 4, weeklyCompleted: 1, weeklyTotal: 6, streak: expect.any(Number), bestStreak: expect.any(Number) });
    });
  });
  describe('getMissionById()', () => {
    it('returns mission detail (full detail format, not list format)', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(dailyMissions[0]);
      const r = await service.getMissionById(userId, 'd1');
      // El detalle expone period, claimed, periodStart, periodEnd y createdAt (brecha C1).
      expect(r).toEqual({
        id: 'd1',
        period: 'daily',
        type: 'feed',
        description: 'Alimenta 2 veces',
        target: 2,
        current: 1,
        completed: false,
        claimed: false,
        reward: { coins: 15, gems: 0, xp: 10 },
        periodStart: '2026-11-13T00:00:00.000Z',
        periodEnd: '2026-11-14T00:00:00.000Z',
        createdAt: '2026-11-13T00:00:01.000Z',
      });
      // El formato de lista (resetsAt) NO debe aparecer en el detalle.
      expect(r).not.toHaveProperty('resetsAt');
    });
    it('throws 404 for non-existent', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.getMissionById(userId, 'nope')).rejects.toThrow(NotFoundException);
    });
  });
  describe('claimReward()', () => {
    it('claims completed mission and credits rewards', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(dailyMissions[2]);
      (prisma.mission.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId, coins: 120, gems: 6, accountXp: 10 });
      (prisma.mission.count as jest.Mock).mockResolvedValue(4);
      const r = await service.claimReward(userId, 'd3');
      expect(r.reward).toEqual({ coins: 10, gems: 1, xp: 10 });
      expect(prisma.mission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'd3', userId, claimed: false }), data: { claimed: true } }));
    });
    it('throws 404 for non-existent', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.claimReward(userId, 'nope')).rejects.toThrow(NotFoundException);
    });
    it('throws 400 if not completed', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(dailyMissions[0]);
      await expect(service.claimReward(userId, 'd1')).rejects.toThrow(BadRequestException);
    });
    it('throws 409 if already claimed', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue({ ...dailyMissions[2], claimed: true });
      await expect(service.claimReward(userId, 'd3')).rejects.toThrow(ConflictException);
    });
    it('race condition: 2 concurrent claims, 1 succeeds 1 conflicts', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(dailyMissions[2]);
      (prisma.mission.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId });
      (prisma.mission.count as jest.Mock).mockResolvedValue(4);
      const results = await Promise.allSettled([service.claimReward(userId, 'd3'), service.claimReward(userId, 'd3')]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    });
  });
  describe('daily chest unlock', () => {
    it('unlocks chest when all daily completed after claim', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue({ ...dailyMissions[3], completed: true });
      (prisma.mission.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId });
      (prisma.mission.count as jest.Mock).mockResolvedValueOnce(4).mockResolvedValueOnce(4);
      const r = await service.claimReward(userId, 'd4');
      expect(r.dailyChestUnlocked).toBe(true);
    });
    it('does not unlock when not all completed', async () => {
      (prisma.mission.findFirst as jest.Mock).mockResolvedValue(dailyMissions[2]);
      (prisma.mission.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: userId });
      (prisma.mission.count as jest.Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(4);
      const r = await service.claimReward(userId, 'd3');
      expect(r.dailyChestUnlocked).toBe(false);
    });
  });
});
