import { Test } from '@nestjs/testing';
import { MinigamesService } from './minigames.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { BondingService } from '../bonding/bonding.service';

const CFG = {
  minigames: {
    sessionTtlSeconds: 300, graceSeconds: 5, cooldownSeconds: 15,
    dailyRewardedSessions: 2, energyCost: 10, minEnergy: 10,
    games: {
      reflex: {
        name: 'Reflejos', durationSeconds: 30, minDurationSeconds: 10, maxScorePerSecond: 2,
        coinsPerPoint: 0.6, maxCoins: 36, xpPerPoint: 1.5, maxXp: 50, happiness: 12,
      },
    },
  },
};

describe('MinigamesService', () => {
  let service: MinigamesService;
  const prisma: any = {
    minigameSession: {
      count: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn(), update: jest.fn(),
    },
    user: { update: jest.fn() },
  };
  const pets: any = { getPetById: jest.fn(), applyActivityReward: jest.fn() };
  const bonding: any = { recordInteraction: jest.fn().mockResolvedValue({ bonding: 2, bondingTier: 'acquainted', tierChanged: null }) };

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        MinigamesService,
        { provide: PrismaService, useValue: prisma },
        { provide: GameDataService, useValue: { getBalance: () => CFG } },
        { provide: PetsService, useValue: pets },
        { provide: BondingService, useValue: bonding },
      ],
    }).compile();
    service = mod.get(MinigamesService);
  });

  describe('start', () => {
    const okPet = { id: 'p', sleeping: false, energy: 80 };
    beforeEach(() => {
      pets.getPetById.mockResolvedValue(okPet);
      prisma.minigameSession.count.mockResolvedValue(0);
      prisma.minigameSession.findFirst.mockResolvedValue(null);
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 0 });
      prisma.minigameSession.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 's1', startedAt: new Date(), ...data }));
    });

    it('crea una sesión con semilla del servidor', async () => {
      const r = await service.start('u', 'reflex', 'p');
      expect(r.sessionId).toBe('s1');
      expect(r.seed).toBeGreaterThan(0);
      expect(r.durationSeconds).toBe(30);
    });

    it('rechaza minijuegos desconocidos, mascota dormida o cansada', async () => {
      await expect(service.start('u', 'nope', 'p')).rejects.toThrow('no encontrado');
      pets.getPetById.mockResolvedValue({ ...okPet, sleeping: true });
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('durmiendo');
      pets.getPetById.mockResolvedValue({ ...okPet, energy: 5 });
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('cansada');
    });

    it('aplica el límite diario y el cooldown', async () => {
      prisma.minigameSession.count.mockResolvedValue(2);
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('límite diario');
      prisma.minigameSession.count.mockResolvedValue(0);
      prisma.minigameSession.findFirst.mockResolvedValue({ startedAt: new Date() });
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('Espera');
    });
  });

  describe('finish', () => {
    const session = (secondsAgo: number) => ({
      id: 's1', userId: 'u', petId: 'p', gameId: 'reflex', finishedAt: null,
      startedAt: new Date(Date.now() - secondsAgo * 1000),
    });
    beforeEach(() => {
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 1 });
      pets.applyActivityReward.mockResolvedValue({ id: 'p' });
    });

    it('recompensa una puntuación plausible, con topes', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(30));
      const r = await service.finish('u', 's1', 50);
      expect(r.rewards.coins).toBe(30); // 50*0.6
      expect(r.rewards.xp).toBe(50); // min(50, 75)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ coins: { increment: 30 } }) }));
      expect(pets.applyActivityReward).toHaveBeenCalled();
    });

    it('limita la recompensa al máximo del juego', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(35));
      const r = await service.finish('u', 's1', 70);
      expect(r.rewards.coins).toBe(36);
    });

    it('rechaza puntuaciones imposibles y partidas demasiado cortas sin recompensar', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(30));
      await expect(service.finish('u', 's1', 9999)).rejects.toThrow('imposible');
      prisma.minigameSession.findFirst.mockResolvedValue(session(3));
      await expect(service.finish('u', 's1', 5)).rejects.toThrow('demasiado corta');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(pets.applyActivityReward).not.toHaveBeenCalled();
    });

    it('rechaza sesiones caducadas, ya finalizadas, ajenas y puntuaciones inválidas', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(400));
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('caducado');
      prisma.minigameSession.findFirst.mockResolvedValue({ ...session(30), finishedAt: new Date() });
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('ya fue finalizada');
      prisma.minigameSession.findFirst.mockResolvedValue(null);
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('no encontrada');
      await expect(service.finish('u', 's1', -1)).rejects.toThrow('entero');
      await expect(service.finish('u', 's1', 1.5)).rejects.toThrow('entero');
    });

    it('si otra petición ya cerró la sesión (carrera) no recompensa dos veces', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(30));
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('ya fue finalizada');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
