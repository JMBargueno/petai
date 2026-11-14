import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PetsService } from './pets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GameDataService } from '../game-data/game-data.service';
import { WeatherService } from '../environmental/weather.service';
import { BondingService } from '../bonding/bonding.service';

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
    // Umbbral alto para que los tests de decaimiento no disparen la notificación de vitales críticas.
    getNotificationConfig: jest
      .fn()
      .mockReturnValue({ vitalsCriticalThreshold: 999, quietStart: 23, quietEnd: 7, defaultMaxPerDay: 3, dedupWindowMs: 300000 }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  // Vínculo (feature 006): mock del BondingService
  const mockBondingService = {
    recordInteraction: jest.fn().mockResolvedValue({ bonding: 0, bondingTier: 'acquainted', tierChanged: null }),
    applyDecay: jest.fn().mockResolvedValue({ decayed: false, bonding: 0, bondingTier: 'acquainted', delta: 0 }),
    bondingFields: jest.fn().mockReturnValue({
      bonding: 0,
      bondingTier: 'acquainted',
      bondingTierName: 'Acostumbrado',
      lastInteractionAt: '2026-01-01T00:00:00.000Z',
    }),
  };

  // Clima ambiental por defecto sin modificador (condición 'unknown').
  const mockWeatherService = {
    getWeather: jest
      .fn()
      .mockResolvedValue({ condition: 'unknown', temperature: null, weatherCode: null, cached: false, fetchedAt: null }),
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
        { provide: WeatherService, useValue: mockWeatherService },
        { provide: BondingService, useValue: mockBondingService },
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

  describe('modificadores ambientales (feature 005)', () => {
    const FIXED_NOW = new Date('2026-11-13T15:00:00Z');
    const baseBalance = {
      vitals: {
        max: 100,
        min: 0,
        decayPerHour: {
          awake: { hunger: 5, happiness: 4, energy: 3, hygiene: 2.5 },
          sleeping: { hunger: 1.5, happiness: 1, energy: -20, hygiene: 0.5 },
        },
      },
      environmental: {
        hot_temp: 30,
        cold_temp: 5,
        hunger_hot: 0.5,
        happiness_rain: 0.5,
        energy_snow: 0.5,
        inactivityThresholdHours: 2,
      },
    };
    const pet3h = () => ({
      id: 'pet-env',
      userId: 'user-env',
      hunger: 100,
      happiness: 100,
      energy: 100,
      hygiene: 100,
      health: 100,
      sick: false,
      sleeping: false,
      lastTickAt: new Date(FIXED_NOW.getTime() - 3 * 60 * 60 * 1000),
    });
    const weather = (condition: string) =>
      mockWeatherService.getWeather.mockResolvedValue({
        condition,
        temperature: condition === 'hot' ? 32 : 5,
        weatherCode: 0,
        cached: false,
        fetchedAt: null,
      });

    beforeEach(() => {
      // Reloj fijo: evita fugas de `setSystemTime`/`Date.now` de otros bloques y hace el
      // cálculo del lazy tick (3 h) determinista.
      jest.useFakeTimers().setSystemTime(FIXED_NOW);
      mockGameDataService.getBalance.mockReturnValue(baseBalance);
      mockPrismaService.user.findUnique.mockResolvedValue({
        timezone: 'UTC',
        latitude: 19.4,
        longitude: -99.13,
      });
    });
    afterEach(() => {
      jest.useRealTimers();
      mockGameDataService.getBalance.mockReturnValue({
        vitals: {
          decayPerHour: {
            awake: { hunger: 5.0, happiness: 4.0, energy: 3.0, hygiene: 2.5 },
            sleeping: { hunger: 1.5, happiness: 1.0, energy: -20.0, hygiene: 0.5 },
          },
        },
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    });

    it('hot: decae el hambre el extra de hunger_hot (±0.5/h)', async () => {
      weather('hot');
      const updated = await (service as any).applyLazyTick(pet3h());
      // hambre: 100 - 5*3 - 0.5*3 = 100 - 15 - 1.5 = 83.5
      expect(updated.hunger).toBe(83.5);
    });

    it('rain: recupera felicidad (happiness_rain)', async () => {
      weather('rain');
      const updated = await (service as any).applyLazyTick(pet3h());
      // felicidad: 100 - 4*3 + 0.5*3 = 88 + 1.5 = 89.5
      expect(updated.happiness).toBe(89.5);
    });

    it('snow: gasta energía (energy_snow)', async () => {
      weather('snow');
      const updated = await (service as any).applyLazyTick(pet3h());
      // energía: 100 - 3*3 - 0.5*3 = 91 - 1.5 = 89.5
      expect(updated.energy).toBe(89.5);
    });

    it('acota el modificador al rango [0, max]', async () => {
      weather('hot');
      const pet = { ...pet3h(), hunger: 2 };
      const updated = await (service as any).applyLazyTick(pet);
      // 2 - 15 - 1.5 < 0 → 0
      expect(updated.hunger).toBe(0);
    });

    it('sin condición ambiental (unknown) no aplica modificador', async () => {
      weather('unknown');
      const updated = await (service as any).applyLazyTick(pet3h());
      // hambre: 100 - 5*3 = 85 (sin modificador)
      expect(updated.hunger).toBe(85);
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
