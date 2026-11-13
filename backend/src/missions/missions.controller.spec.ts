import { Test, TestingModule } from '@nestjs/testing';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';

describe('MissionsController', () => {
  let controller: MissionsController;
  let service: MissionsService;

  const mockUser = { id: 'user-123', timezone: 'America/Mexico_City' };

  const mockMissionsResponse = {
    timestamp: '2026-11-13T14:30:00.000Z',
    daily: [
      { id: 'm1', type: 'feed', description: 'Alimenta a tu pet 2 veces', target: 2, current: 1, completed: false, reward: { coins: 15, gems: 0, xp: 10 }, resetsAt: '2026-11-14T06:00:00.000Z' },
    ],
    weekly: [
      { id: 'm2', type: 'level_up', description: 'Sube 1 pet de nivel', target: 1, current: 0, completed: false, reward: { coins: 100, gems: 5, xp: 100 }, resetsAt: '2026-11-17T06:00:00.000Z' },
    ],
    dailyChestUnlocked: false,
  };

  beforeEach(async () => {
    const mockMissionsService = {
      getMissions: jest.fn().mockResolvedValue(mockMissionsResponse),
      getSummary: jest.fn().mockResolvedValue({ dailyCompleted: 1, dailyTotal: 4, weeklyCompleted: 1, weeklyTotal: 6, streak: 5, bestStreak: 12 }),
      getMissionById: jest.fn().mockResolvedValue({ id: 'm1', type: 'feed', period: 'daily', description: 'test', target: 2, current: 1, completed: false, claimed: false, reward: { coins: 15, gems: 0, xp: 10 }, periodStart: new Date(), periodEnd: new Date() }),
      claimReward: jest.fn().mockResolvedValue({ mission: { id: 'm1', type: 'feed', completed: true }, reward: { coins: 15, gems: 0, xp: 10 }, dailyChestUnlocked: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MissionsController],
      providers: [
        { provide: MissionsService, useValue: mockMissionsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MissionsController>(MissionsController);
    service = module.get<MissionsService>(MissionsService);
  });

  describe('GET /missions', () => {
    it('should return 200 with missions for authenticated user', async () => {
      const result = await controller.getMissions(mockUser);
      expect(result).toEqual(mockMissionsResponse);
      expect(service.getMissions).toHaveBeenCalledWith('user-123', 'America/Mexico_City');
    });

    it('should route to MissionsService.getMissions()', async () => {
      await controller.getMissions(mockUser);
      expect(service.getMissions).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /missions/summary', () => {
    it('should return summary data', async () => {
      const result = await controller.getSummary(mockUser);
      expect(result).toEqual({ dailyCompleted: 1, dailyTotal: 4, weeklyCompleted: 1, weeklyTotal: 6, streak: 5, bestStreak: 12 });
    });
  });

  describe('GET /missions/:id', () => {
    it('should return mission detail', async () => {
      const result = await controller.getMissionById(mockUser, 'm1');
      expect(result.id).toBe('m1');
      expect(service.getMissionById).toHaveBeenCalledWith('user-123', 'm1');
    });
  });

  describe('POST /missions/:id/claim', () => {
    it('should claim reward', async () => {
      const result = await controller.claimReward(mockUser, 'm1');
      expect(result.mission.id).toBe('m1');
      expect(result.reward.coins).toBe(15);
      expect(service.claimReward).toHaveBeenCalledWith('user-123', 'm1');
    });
  });
});
