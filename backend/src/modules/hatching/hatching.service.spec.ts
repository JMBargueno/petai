import { Test, TestingModule } from '@nestjs/testing';
import { HatchingService } from './hatching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PET_NAMES } from './pet-names';

describe('HatchingService', () => {
  let service: HatchingService;

  const mockPrismaService = {
    egg: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    pityCounter: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    pet: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(mockPrismaService) : Promise.resolve(cb))),
  };

  /** Configura el mock para que `hatchEgg` complete una eclosión y devuelve el pet creado. */
  function setupSuccessfulHatch() {
    mockPrismaService.egg.findFirst.mockResolvedValue({
      id: 'egg-1',
      userId: 'user-1',
      hatchesAt: new Date(Date.now() - 60_000),
      hatchedPetId: null,
    });
    mockPrismaService.pityCounter.findUnique.mockResolvedValue({
      userId: 'user-1',
      sinceSuperRare: 0,
      sinceLegendary: 0,
    });
    mockPrismaService.pet.create.mockImplementation(async ({ data }: any) => data);
  }

  const mockGameDataService = {
    getBalance: jest.fn().mockReturnValue({
      rarity: {
        normal: { probability: 0.60, multiplier: 1.00 },
        rare: { probability: 0.25, multiplier: 1.15 },
        super_rare: { probability: 0.10, multiplier: 1.30 },
        legendary: { probability: 0.04, multiplier: 1.50 },
        mythic: { probability: 0.01, multiplier: 1.75 },
      },
      pity: { superRareThreshold: 30, legendaryThreshold: 120 },
    }),
    getSpecies: jest.fn().mockReturnValue([
      {
        id: 'ignisaur',
        name: 'Ignisaurio',
        rarity: 'normal',
        baseStats: { hp: 50, atk: 55, def: 45, vel: 48, esp: 52 },
        defaultPalette: { primary: '#E25822' },
      },
    ]),
    getPatterns: jest.fn().mockReturnValue([
      { id: 'plain', name: 'Liso', rarity: 'normal' },
    ]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HatchingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GameDataService, useValue: mockGameDataService },
      ],
    }).compile();

    service = module.get<HatchingService>(HatchingService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe garantizar al menos Super-raro cuando sinceSuperRare llega a 29', () => {
    // Probamos el método rollRarity interno
    const rollMethod = (service as any).rollRarity.bind(service);
    for (let i = 0; i < 20; i++) {
      const rarity = rollMethod(29, 0);
      expect(['super_rare', 'legendary', 'mythic']).toContain(rarity);
    }
  });

  it('debe garantizar Legendario o Mítico cuando sinceLegendary llega a 119', () => {
    const rollMethod = (service as any).rollRarity.bind(service);
    for (let i = 0; i < 20; i++) {
      const rarity = rollMethod(10, 119);
      expect(['legendary', 'mythic']).toContain(rarity);
    }
  });

  it('debe respetar las proporciones de rareza en tiradas masivas (10,000 tiradas)', () => {
    const rollMethod = (service as any).rollRarity.bind(service);
    const counts: Record<string, number> = {
      normal: 0,
      rare: 0,
      super_rare: 0,
      legendary: 0,
      mythic: 0,
    };

    const TOTAL = 10000;
    for (let i = 0; i < TOTAL; i++) {
      const rarity = rollMethod(0, 0);
      counts[rarity]++;
    }

    // Normal debe estar en torno al 60% ± 4%
    expect(counts.normal / TOTAL).toBeGreaterThan(0.56);
    expect(counts.normal / TOTAL).toBeLessThan(0.64);

    // Rare en torno al 25% ± 3%
    expect(counts.rare / TOTAL).toBeGreaterThan(0.22);
    expect(counts.rare / TOTAL).toBeLessThan(0.28);
  });

  describe('hatchEgg — rareza', () => {
    it('el ejemplar lleva la rareza de su especie aunque la tirada sea legendaria', async () => {
      setupSuccessfulHatch();
      // Pity al límite: la tirada sale legendaria o mítica, pero solo hay especies normales.
      mockPrismaService.pityCounter.findUnique.mockResolvedValue({ userId: 'user-1', sinceSuperRare: 10, sinceLegendary: 119 });
      const pet: any = await service.hatchEgg('user-1', 'egg-1', 'Chispa');
      expect(pet.speciesId).toBe('ignisaur');
      expect(pet.rarity).toBe('normal');
      // Sin multiplicador de rareza: las estadísticas son las de la especie.
      expect(pet.combatStats).toEqual({ hp: 50, atk: 55, def: 45, vel: 48, esp: 52 });
    });

    it('la garantía de pity sigue pendiente si no se ha conseguido la rareza', async () => {
      setupSuccessfulHatch();
      mockPrismaService.pityCounter.findUnique.mockResolvedValue({ userId: 'user-1', sinceSuperRare: 10, sinceLegendary: 119 });
      await service.hatchEgg('user-1', 'egg-1', 'Chispa');
      expect(mockPrismaService.pityCounter.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { sinceSuperRare: 11, sinceLegendary: 120 } }),
      );
    });
  });

  describe('hatchEgg — nickname', () => {
    it('guarda el nickname tal cual si es válido (normalizando trim/control)', async () => {
      setupSuccessfulHatch();
      await service.hatchEgg('user-1', 'egg-1', '  Firulais\u0000  ');
      const data = mockPrismaService.pet.create.mock.calls[0][0].data;
      expect(data.nickname).toBe('Firulais');
    });

    it('rechaza con 400 si el nickname supera los 16 caracteres', async () => {
      setupSuccessfulHatch();
      await expect(service.hatchEgg('user-1', 'egg-1', 'a'.repeat(17))).rejects.toThrow(
        'El nombre debe tener entre 1 y 16 caracteres',
      );
      expect(mockPrismaService.pet.create).not.toHaveBeenCalled();
    });

    it('asigna un nombre del pool de 300 si el nickname es vacío', async () => {
      setupSuccessfulHatch();
      await service.hatchEgg('user-1', 'egg-1', '   ');
      const data = mockPrismaService.pet.create.mock.calls[0][0].data;
      expect(PET_NAMES).toContain(data.nickname);
    });

    it('asigna un nombre del pool de 300 si el nickname está ausente', async () => {
      setupSuccessfulHatch();
      await service.hatchEgg('user-1', 'egg-1');
      const data = mockPrismaService.pet.create.mock.calls[0][0].data;
      expect(PET_NAMES).toContain(data.nickname);
    });
  });
});
