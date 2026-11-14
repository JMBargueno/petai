import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConstellationService } from './constellation.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameDataService } from '../modules/game-data/game-data.service';

const CONSTELLATIONS = {
  version: 'v1',
  categories: {
    battle: {
      name: 'Batalla',
      stars: {
        battle_1_wins: { x: 0.25, y: 0.4 },
        battle_10_wins: { x: 0.45, y: 0.45 },
      },
      connections: [['battle_1_wins', 'battle_10_wins']],
    },
  },
};

const DEFS = [
  { id: 'battle_1_wins', name: 'Primera victoria', category: 'battle', target: 1, event: 'battle_win', tier: 'common' },
  { id: 'battle_10_wins', name: 'Guerrero', category: 'battle', target: 10, event: 'battle_win', tier: 'rare' },
];

describe('ConstellationService', () => {
  let service: ConstellationService;
  let prisma: PrismaService;
  let gameData: GameDataService;
  const userId = 'user-1';

  beforeEach(async () => {
    const mockPrisma = { achievement: { findMany: jest.fn().mockResolvedValue([]) } };
    const mockGame = {
      getConstellations: jest.fn().mockReturnValue(CONSTELLATIONS),
      getAchievements: jest.fn().mockReturnValue({ version: 'v1', achievements: DEFS }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConstellationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GameDataService, useValue: mockGame },
      ],
    }).compile();
    service = module.get(ConstellationService);
    prisma = module.get(PrismaService);
    gameData = module.get(GameDataService);
  });

  it('returns the layout with star coords, status and connections for a valid category', async () => {
    const res = await service.getConstellation(userId, 'battle');
    expect(res.category).toBe('battle');
    expect(res.name).toBe('Batalla');
    expect(res.stars).toHaveLength(2);
    const s = res.stars.find((st) => st.id === 'battle_1_wins')!;
    expect(s.x).toBe(0.25);
    expect(s.y).toBe(0.4);
    expect(s.status).toBe('locked'); // sin fila
    expect(s.name).toBe('Primera victoria');
    expect(res.connections).toEqual([['battle_1_wins', 'battle_10_wins']]);
  });

  it('computes coherent status per star from the user rows', async () => {
    (prisma.achievement.findMany as jest.Mock).mockResolvedValue([
      { achId: 'battle_10_wins', current: 10, unlockedAt: new Date() },
    ]);
    const res = await service.getConstellation(userId, 'battle');
    const unlocked = res.stars.find((st) => st.id === 'battle_10_wins')!;
    const locked = res.stars.find((st) => st.id === 'battle_1_wins')!;
    expect(unlocked.status).toBe('unlocked');
    expect(locked.status).toBe('locked');
  });

  it('throws 400 for an invalid category', async () => {
    await expect(service.getConstellation(userId, 'nonsense')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when the constellations game-data is not loaded', async () => {
    (gameData.getConstellations as jest.Mock).mockReturnValue(null);
    await expect(service.getConstellation(userId, 'battle')).rejects.toBeInstanceOf(BadRequestException);
  });
});
