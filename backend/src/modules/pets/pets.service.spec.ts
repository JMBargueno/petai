import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PetsService } from './pets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GameDataService } from '../game-data/game-data.service';

describe('PetsService', () => {
  let service: PetsService;

  const mockPrismaService = {
    pet: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn((args) => Promise.resolve({ ...args.data, id: args.where.id })),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
    },
  };

  const mockInventoryService = {
    consumeItem: jest.fn(),
  };

  const mockRealtimeGateway = {
    emitPetUpdate: jest.fn(),
  };

  const mockGameDataService = {
    getBalance: jest.fn().mockReturnValue({
      vitals: {
        decayPerHour: {
          awake: { hunger: 5.0, happiness: 4.0, energy: 3.0, hygiene: 2.5 },
          sleeping: { hunger: 1.5, happiness: 1.0, energy: -20.0, hygiene: 0.5 },
        },
      },
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: RealtimeGateway, useValue: mockRealtimeGateway },
        { provide: GameDataService, useValue: mockGameDataService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PetsService>(PetsService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe calcular correctamente el deterioro perezoso tras 2 horas de vigilia', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const pet = {
      id: 'pet-1',
      hunger: 100,
      happiness: 100,
      energy: 100,
      hygiene: 100,
      health: 100,
      sick: false,
      sleeping: false,
      lastTickAt: twoHoursAgo,
    };

    const updated = await (service as any).applyLazyTick(pet);
    // Hambre: 100 - (5.0 * 2) = 90
    expect(updated.hunger).toBe(90);
    // Felicidad: 100 - (4.0 * 2) = 92
    expect(updated.happiness).toBe(92);
    // Energía: 100 - (3.0 * 2) = 94
    expect(updated.energy).toBe(94);
    // Higiene: 100 - (2.5 * 2) = 95
    expect(updated.hygiene).toBe(95);
  });

  it('debe aplicar multiplicador 1.5x de comida favorita', async () => {
    const pet = {
      id: 'pet-1',
      userId: 'user-1',
      hunger: 50,
      happiness: 50,
      health: 50,
      energy: 50,
      sleeping: false,
      species: { favoriteFood: 'spicy_berry' },
      xp: 0,
      level: 1,
      statPoints: 0,
      stage: 'baby',
    };

    jest.spyOn(service, 'getPetById').mockResolvedValue(pet as any);
    mockInventoryService.consumeItem.mockResolvedValue({
      id: 'spicy_berry',
      effects: { hunger: 20, happiness: 10, health: 0, energy: 0 },
    });

    await service.feed('user-1', 'pet-1', 'spicy_berry');

    // 20 * 1.5 = 30 hambre extra => 50 + 30 = 80
    // 10 * 1.5 = 15 felicidad extra => 50 + 15 = 65
    expect(mockPrismaService.pet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hunger: 80,
          happiness: 65,
        }),
      }),
    );
  });

  it('debe calcular la progresión de niveles y evolución', async () => {
    const pet = {
      id: 'pet-1',
      level: 1,
      xp: 0,
      statPoints: 0,
      stage: 'baby',
    };

    // Para nivel 1 -> xp necesaria = round(100 * 1^1.5) = 100
    // Si otorgamos 150 XP: sube a nivel 2 y sobran 50 XP
    const leveled = await (service as any).addXpInternal(pet, 150);
    expect(leveled.level).toBe(2);
    expect(leveled.xp).toBe(50);
    expect(leveled.statPoints).toBe(3);
  });

  describe('ciclo de sueño (zona horaria)', () => {
    const baseBalance = mockGameDataService.getBalance();
    const sleepBalance = {
      ...baseBalance,
      sleep: {
        nightStartHour: 22,
        nightEndHour: 7,
        awakeNightEnergyMultiplier: 1.5,
        sleepingNightEnergyBonus: 1.25,
        sleepingNightHealthRegenPerHour: 2.0,
      },
    };
    // Intervalo fijo de 2 h totalmente nocturno en UTC: 01:00 -> 03:00
    const realNow = Date.now;
    beforeEach(() => {
      Date.now = () => new Date('2026-06-10T03:00:00Z').getTime();
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T03:00:00Z'));
      mockGameDataService.getBalance.mockReturnValue(sleepBalance);
    });
    afterEach(() => {
      Date.now = realNow;
      jest.useRealTimers();
      mockGameDataService.getBalance.mockReturnValue(baseBalance);
      mockPrismaService.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    });

    const awakePet = () => ({
      id: 'p', userId: 'u', hunger: 100, happiness: 100, energy: 100, hygiene: 100,
      health: 100, sick: false, sleeping: false, lastTickAt: new Date('2026-06-10T01:00:00Z'),
    });

    it('despierta de noche gasta más energía (x1.5)', async () => {
      const updated = await (service as any).applyLazyTick(awakePet());
      // 3.0/h * (2h + 0.5*2h) = 9 -> 91
      expect(updated.energy).toBe(91);
    });

    it('la misma hora en una zona donde es de día no penaliza', async () => {
      // 01:00-03:00 UTC = 10:00-12:00 en Tokio (de día)
      mockPrismaService.user.findUnique.mockResolvedValue({ timezone: 'Asia/Tokyo' });
      const updated = await (service as any).applyLazyTick(awakePet());
      expect(updated.energy).toBe(94);
    });

    it('dormir de noche recupera más energía (x1.25) y regenera salud', async () => {
      const pet = { ...awakePet(), sleeping: true, energy: 20, health: 50 };
      const updated = await (service as any).applyLazyTick(pet);
      // 20/h * (2h + 0.25*2h) = 50 -> 70
      expect(updated.energy).toBe(70);
      // +2 salud/h nocturna * 2h = 54
      expect(updated.health).toBe(54);
    });
  });

  describe('evolución a forma final', () => {
    const balance = () => ({ ...mockGameDataService.getBalance(), evolution: { finalStageItemId: 'evolution_stone', finalStageMinLevel: 50 } });
    beforeEach(() => {
      mockGameDataService.getBalance.mockReturnValue(balance());
      mockInventoryService.consumeItem.mockReset();
    });

    it('rechaza si el nivel es insuficiente y no consume el objeto', async () => {
      jest.spyOn(service, 'getPetById').mockResolvedValue({ id: 'p', stage: 'adult', level: 30 } as any);
      await expect(service.evolve('u', 'p')).rejects.toThrow('nivel 50');
      expect(mockInventoryService.consumeItem).not.toHaveBeenCalled();
    });

    it('rechaza si ya está en forma final', async () => {
      jest.spyOn(service, 'getPetById').mockResolvedValue({ id: 'p', stage: 'final', level: 60 } as any);
      await expect(service.evolve('u', 'p')).rejects.toThrow('forma final');
    });

    it('evoluciona consumiendo la piedra de evolución', async () => {
      jest.spyOn(service, 'getPetById').mockResolvedValue({ id: 'p', stage: 'adult', level: 50 } as any);
      mockInventoryService.consumeItem.mockResolvedValue({ id: 'evolution_stone' });
      const updated = await service.evolve('u', 'p');
      expect(mockInventoryService.consumeItem).toHaveBeenCalledWith('u', 'evolution_stone', 'evolution');
      expect(updated.stage).toBe('final');
    });

    it('subir de nivel no otorga la forma final automáticamente ni la revierte', async () => {
      const grown = await (service as any).addXpInternal(
        { id: 'p', level: 49, xp: 0, statPoints: 0, stage: 'adult' }, 40000);
      expect(grown.level).toBeGreaterThanOrEqual(50);
      expect(grown.stage).toBe('adult');
      const kept = await (service as any).addXpInternal(
        { id: 'p', level: 60, xp: 0, statPoints: 0, stage: 'final' }, 500);
      expect(kept.stage).toBe('final');
    });
  });
});
