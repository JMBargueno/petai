import { Test, TestingModule } from '@nestjs/testing';
import { HatchingService } from './hatching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';

describe('HatchingService', () => {
  let service: HatchingService;

  const mockPrismaService = {
    egg: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pityCounter: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pet: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

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
      { id: 'plain', name: 'Liso', minRarity: 'normal' },
    ]),
  };

  beforeEach(async () => {
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
});
