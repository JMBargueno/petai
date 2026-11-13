import { Test, TestingModule } from '@nestjs/testing';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: RealtimeGateway, useValue: mockRealtimeGateway },
        { provide: GameDataService, useValue: mockGameDataService },
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
});
