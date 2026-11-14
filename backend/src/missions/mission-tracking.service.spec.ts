import { Test, TestingModule } from '@nestjs/testing';
import { MissionTrackingService } from './mission-tracking.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../modules/realtime/realtime.gateway';
import { ChestsService } from '../modules/chests/chests.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('MissionTrackingService', () => {
  let service: MissionTrackingService;
  let prisma: PrismaService;
  let realtimeGateway: RealtimeGateway;
  let chestsService: ChestsService;
  const userId = 'user-1';

  beforeEach(async () => {
    const mockPrisma = {
      mission: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      chest: { count: jest.fn().mockResolvedValue(0) },
    };
    const mockRealtime = { emitToUser: jest.fn() };
    const mockChestsService = { grantChest: jest.fn().mockResolvedValue(undefined) };
    const mockEvents = { emit: jest.fn(), emitAsync: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissionTrackingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtime },
        { provide: ChestsService, useValue: mockChestsService },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();
    service = module.get(MissionTrackingService);
    prisma = module.get(PrismaService);
    realtimeGateway = module.get(RealtimeGateway);
    chestsService = module.get(ChestsService);
  });

  it('pet:fed increments feed mission progress atomically (updateMany conditioned on current)', async () => {
    const mission = { id: 'm1', type: 'feed', target: 2, current: 1, completed: false, period: 'daily', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), rewardCoins: 15, rewardGems: 0, rewardXp: 10 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([mission]);
    await service.onPetFed({ userId, petId: 'p1' });
    expect(prisma.mission.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', userId, current: 1, completed: false },
      data: { current: 2, completed: true },
    });
  });

  it('battle:finished with won=true increments battle AND battle_win', async () => {
    const battleMission = { id: 'b1', type: 'battle', target: 1, current: 0, completed: false, period: 'weekly', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), rewardCoins: 25, rewardGems: 0, rewardXp: 20 };
    const winMission = { id: 'w1', type: 'battle_win', target: 3, current: 0, completed: false, period: 'weekly', periodStart: new Date(), periodEnd: new Date(Date.now() + 7 * 86400000), rewardCoins: 150, rewardGems: 3, rewardXp: 80 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValueOnce([battleMission]).mockResolvedValueOnce([winMission]);
    await service.onBattleFinished({ userId, won: true, petId: 'p1' });
    expect(prisma.mission.updateMany).toHaveBeenCalledTimes(2);
  });

  it('retries with the fresh value on a concurrent update (conflict)', async () => {
    const mission = { id: 'm1', type: 'feed', target: 3, current: 1, completed: false, period: 'daily', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), rewardCoins: 15, rewardGems: 0, rewardXp: 10 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([mission]);
    // 1er intento: conflicto (otro evento cambió `current`). 2do intento: éxito con el valor vigente.
    (prisma.mission.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    (prisma.mission.findUnique as jest.Mock).mockResolvedValue({ current: 2, target: 3, completed: false });
    await service.onPetFed({ userId, petId: 'p1' });
    expect(prisma.mission.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.mission.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'm1', userId, current: 2, completed: false },
      data: { current: 3, completed: true },
    });
  });

  it('egg:hatched with rare rarity increments hatch AND hatch_rare', async () => {
    const hatchMission = { id: 'h1', type: 'hatch', target: 1, current: 0, completed: false, period: 'weekly', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), rewardCoins: 50, rewardGems: 5, rewardXp: 20 };
    const rareMission = { id: 'hr1', type: 'hatch_rare', target: 1, current: 0, completed: false, period: 'weekly', periodStart: new Date(), periodEnd: new Date(Date.now() + 7 * 86400000), rewardCoins: 200, rewardGems: 10, rewardXp: 0 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValueOnce([hatchMission]).mockResolvedValueOnce([rareMission]);
    await service.onEggHatched({ userId, rarity: 'rare' });
    expect(prisma.mission.updateMany).toHaveBeenCalledTimes(2);
  });

  it('event with no active mission is a no-op', async () => {
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([]);
    await service.onPetFed({ userId, petId: 'p1' });
    expect(prisma.mission.updateMany).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToUser).not.toHaveBeenCalled();
  });

  it('current >= target marks completed and emits mission:completed', async () => {
    const mission = { id: 'm1', type: 'feed', target: 2, current: 1, completed: false, period: 'daily', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), rewardCoins: 15, rewardGems: 0, rewardXp: 10 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([mission]);
    await service.onPetFed({ userId, petId: 'p1' });
    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(userId, 'mission:completed', expect.objectContaining({ missionId: 'm1', type: 'feed', reward: { coins: 15, gems: 0, xp: 10 } }));
  });

  it('grants a daily chest when all daily missions complete', async () => {
    const mission = { id: 'm1', type: 'feed', target: 2, current: 1, completed: false, period: 'daily', periodStart: new Date('2026-11-13T00:00:00Z'), periodEnd: new Date('2026-11-14T00:00:00Z'), rewardCoins: 15, rewardGems: 0, rewardXp: 10 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([mission]);
    // dailyCompleted === dailyTotal (>0) → se otorga el cofre diario.
    (prisma.mission.count as jest.Mock).mockResolvedValue(2);
    await service.onPetFed({ userId, petId: 'p1' });
    expect(chestsService.grantChest).toHaveBeenCalledWith(userId, 'bronze', 'daily_mission');
    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(userId, 'mission:daily_complete', { chestUnlocked: true });
  });

  it('does NOT grant a daily chest when completing a weekly mission', async () => {
    const mission = { id: 'w1', type: 'level_up', target: 1, current: 0, completed: false, period: 'weekly', periodStart: new Date('2026-11-10T00:00:00Z'), periodEnd: new Date('2026-11-17T00:00:00Z'), rewardCoins: 100, rewardGems: 5, rewardXp: 100 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([mission]);
    (prisma.mission.count as jest.Mock).mockResolvedValue(2);
    await service.onPetLevelUp({ userId, petId: 'p1' });
    expect(chestsService.grantChest).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToUser).not.toHaveBeenCalledWith(userId, 'mission:daily_complete', expect.anything());
  });

  it('throttles mission:progress to 1 per 2s per mission', async () => {
    const mission = { id: 'm1', type: 'feed', target: 5, current: 1, completed: false, period: 'daily', periodStart: new Date(), periodEnd: new Date(Date.now() + 86400000), rewardCoins: 15, rewardGems: 0, rewardXp: 10 };
    (prisma.mission.findMany as jest.Mock).mockResolvedValue([mission]);
    await service.onPetFed({ userId, petId: 'p1' });
    await service.onPetFed({ userId, petId: 'p1' });
    // First emit passes through, second is throttled
    const progressEmits = (realtimeGateway.emitToUser as jest.Mock).mock.calls.filter((c) => c[1] === 'mission:progress');
    expect(progressEmits.length).toBeLessThanOrEqual(1);
  });
});
