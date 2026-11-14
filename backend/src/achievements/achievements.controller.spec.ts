import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';
import { ConstellationService } from './constellation.service';

describe('AchievementsController', () => {
  let controller: AchievementsController;
  let achievementsService: AchievementsService;
  let constellationService: ConstellationService;
  const user = { id: 'user-1' };

  beforeEach(async () => {
    const mockAchievements = {
      getAll: jest.fn().mockResolvedValue({ timestamp: 't', achievementsPublic: false, categories: {} }),
      claim: jest.fn().mockResolvedValue({ achievement: { claimed: true }, reward: { coins: 0, gems: 0, xp: 0, itemId: null } }),
    };
    const mockConstellation = {
      getConstellation: jest.fn().mockResolvedValue({ category: 'battle', name: 'Batalla', stars: [], connections: [] }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchievementsController],
      providers: [
        { provide: AchievementsService, useValue: mockAchievements },
        { provide: ConstellationService, useValue: mockConstellation },
      ],
    }).compile();
    controller = module.get(AchievementsController);
    achievementsService = module.get(AchievementsService);
    constellationService = module.get(ConstellationService);
  });

  it('routes GET /achievements to getAll with the current user id', async () => {
    const result = await controller.getAll(user);
    expect(achievementsService.getAll).toHaveBeenCalledWith('user-1');
    expect(result).toHaveProperty('categories');
  });

  it('routes GET /constellation/:cat to the constellation service', async () => {
    const result = await controller.getConstellation(user, 'battle');
    expect(constellationService.getConstellation).toHaveBeenCalledWith('user-1', 'battle');
    expect(result.category).toBe('battle');
  });

  it('routes POST /:id/claim to claim with the logro id', async () => {
    const result = await controller.claim(user, 'battle_10_wins');
    expect(achievementsService.claim).toHaveBeenCalledWith('user-1', 'battle_10_wins');
    expect(result.achievement.claimed).toBe(true);
  });
});
