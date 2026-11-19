import * as fs from 'fs';
import * as path from 'path';
import { PetsService } from './pets.service';
import { HabitatService } from '../habitat/habitat.service';

/**
 * Buffs del hábitat en el lazy tick de vitales (spec 10): se usa el HabitatService REAL con el
 * game-data real de muebles (sin mock del cálculo), así el test cubre también el recorte al tope.
 */
const habitats = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/habitats.json'), 'utf8'),
);

const NOW = new Date('2026-06-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

function makeServices(furnitureByPet: Record<string, string[]>) {
  const items = Object.entries(furnitureByPet).flatMap(([petId, ids]) =>
    ids.map((furnitureId, i) => ({ id: `${petId}-${i}`, petId, furnitureId })),
  );
  const prisma: any = {
    pet: {
      findMany: jest.fn(),
      update: jest.fn(async (args: any) => ({ ...args.data, id: args.where.id })),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    habitatItem: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = typeof where.petId === 'string' ? [where.petId] : where.petId.in;
        return items.filter((i) => ids.includes(i.petId));
      }),
    },
  };
  const gameData: any = {
    getBalance: () => ({
      vitals: {
        decayPerHour: {
          awake: { hunger: 5.0, happiness: 4.0, energy: 3.0, hygiene: 2.5 },
          sleeping: { hunger: 1.5, happiness: 1.0, energy: -20.0, hygiene: 0.5 },
        },
      },
    }),
    getNotificationConfig: () => ({ vitalsCriticalThreshold: -1 }),
    getHabitats: () => habitats,
  };
  const habitat = new HabitatService(prisma, {} as any, gameData);
  const service = new PetsService(
    prisma,
    {} as any,
    { emitPetUpdate: jest.fn(), emitPetAction: jest.fn() } as any,
    gameData,
    { emit: jest.fn() } as any,
    {
      applyDecay: jest.fn().mockResolvedValue({ decayed: false }),
      bondingFields: jest.fn().mockReturnValue({}),
    } as any,
    undefined,
    habitat,
  );
  return { service, prisma, habitat };
}

const awakePet = (id = 'p1') => ({
  id, userId: 'u1', hunger: 100, happiness: 100, energy: 100, hygiene: 100, health: 100,
  sick: false, sleeping: false, lastTickAt: hoursAgo(2),
});
const sleepingPet = (id = 'p1') => ({ ...awakePet(id), energy: 20, sleeping: true, lastTickAt: hoursAgo(1) });

describe('PetsService · buffs del hábitat en el lazy tick (spec 10)', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }));
  afterAll(() => jest.useRealTimers());

  describe('hygiene_decay_reduction y happiness_decay_reduction', () => {
    it('sin muebles el decaimiento es el base', async () => {
      const { service } = makeServices({});
      const updated = await (service as any).applyLazyTick(awakePet());
      expect(updated.hygiene).toBe(95); // 100 − 2.5·2
      expect(updated.happiness).toBe(92); // 100 − 4·2
    });

    it('con muebles el decaimiento se reduce en el porcentaje del buff (solo higiene y felicidad)', async () => {
      // higiene 0.08 + 0.12 + 0.1 + 0.1 = 0.4; felicidad 0.05 + 0.06 + 0.05 + 0.08 + 0.03 + 0.03 = 0.3
      const { service } = makeServices({
        p1: [
          'fountain_water', 'garden_pond', 'final_garden', 'star_fountain',
          'toy_ball', 'garden_bench', 'crystal_lamp', 'food_bowl', 'garden_swing',
        ],
      });
      const updated = await (service as any).applyLazyTick(awakePet());
      expect(updated.hygiene).toBe(97); // 100 − 2.5·2·(1 − 0.4)
      expect(updated.happiness).toBe(94.4); // 100 − 4·2·(1 − 0.3)
      // hambre y energía despierto no cambian
      expect(updated.hunger).toBe(90);
      expect(updated.energy).toBe(94);
    });

    it('usa el valor recortado al tope, no la suma cruda', async () => {
      // higiene cruda 2×0.1 + 2×0.12 = 0.44 → tope 0.4
      const { service } = makeServices({ p1: ['final_garden', 'final_garden', 'garden_pond', 'garden_pond'] });
      const updated = await (service as any).applyLazyTick(awakePet());
      expect(updated.hygiene).toBe(97); // con la suma cruda sería 100 − 5·0.56 = 97.2
      expect(updated.happiness).toBe(93.28); // felicidad 0.16 (bajo el tope 0.3): 100 − 8·0.84
    });
  });

  describe('energy_recovery_boost', () => {
    it('sin muebles dormir recupera la energía base', async () => {
      const { service } = makeServices({});
      const updated = await (service as any).applyLazyTick(sleepingPet());
      expect(updated.energy).toBe(40); // 20 + 20·1
    });

    it('con la cama dormir recupera un 15 % más', async () => {
      const { service } = makeServices({ p1: ['soft_bed'] });
      const updated = await (service as any).applyLazyTick(sleepingPet());
      expect(updated.energy).toBe(43); // 20 + 20·1.15
    });

    it('recorta al tope (3 camas = 0.45 → 0.4)', async () => {
      const { service } = makeServices({ p1: ['soft_bed', 'soft_bed', 'soft_bed'] });
      const updated = await (service as any).applyLazyTick(sleepingPet());
      expect(updated.energy).toBe(48); // 20 + 20·1.4 (con la suma cruda serían 49)
    });

    it('despierto no afecta al gasto de energía', async () => {
      const { service } = makeServices({ p1: ['soft_bed', 'crystal_lamp'] });
      const updated = await (service as any).applyLazyTick(awakePet());
      expect(updated.energy).toBe(94);
    });
  });

  describe('consultas', () => {
    it('getPets consulta los buffs de todas las mascotas con UNA sola consulta', async () => {
      const { service, prisma } = makeServices({ p1: ['fountain_water'], p2: ['soft_bed'] });
      prisma.pet.findMany.mockResolvedValue([awakePet('p1'), sleepingPet('p2')]);
      const pets = await service.getPets('u1');
      expect(prisma.habitatItem.findMany).toHaveBeenCalledTimes(1);
      expect(pets.find((p: any) => p.id === 'p1')!.hygiene).toBe(95.4); // 100 − 2.5·2·0.92
      expect(pets.find((p: any) => p.id === 'p2')!.energy).toBe(43);
    });

    it('un tick sin cambios (<36 s) no consulta el hábitat', async () => {
      const { service, prisma } = makeServices({ p1: ['fountain_water'] });
      const pet = { ...awakePet(), lastTickAt: new Date(NOW.getTime() - 5000) };
      expect(await (service as any).applyLazyTick(pet)).toBe(pet);
      expect(prisma.habitatItem.findMany).not.toHaveBeenCalled();
    });
  });
});
