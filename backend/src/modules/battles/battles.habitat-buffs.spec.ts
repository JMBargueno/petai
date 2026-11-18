import * as fs from 'fs';
import * as path from 'path';
import { BattlesService } from './battles.service';
import { HabitatService } from '../habitat/habitat.service';
import { moodMultiplier } from './combat/stats';

/** Buff `combat_mood_bonus` de los muebles en el ánimo de combate (spec 10). */
const dataDir = path.resolve(__dirname, '../../../../shared/game-data');
const balance = JSON.parse(fs.readFileSync(path.join(dataDir, 'balance.json'), 'utf8'));
const habitats = JSON.parse(fs.readFileSync(path.join(dataDir, 'habitats.json'), 'utf8'));
const cfg = balance.combats;

function makeBattles(furnitureByPet: Record<string, string[]>, withHabitat = true) {
  const items = Object.entries(furnitureByPet).flatMap(([petId, ids]) => ids.map((furnitureId) => ({ petId, furnitureId })));
  const prisma: any = {
    habitatItem: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = typeof where.petId === 'string' ? [where.petId] : where.petId.in;
        return items.filter((i) => ids.includes(i.petId));
      }),
    },
  };
  const gameData: any = { getBalance: () => balance, getSkills: () => [], getHabitats: () => habitats };
  const habitat = withHabitat ? new HabitatService(prisma, {} as any, gameData) : undefined;
  const n = null as any;
  const battles = new BattlesService(n, gameData, n, n, n, n, n, n, n, habitat);
  return { battles, prisma };
}

const pet = (id: string, o: Partial<{ happiness: number; health: number; sick: boolean }> = {}) => ({
  id, userId: `u-${id}`, nickname: id, level: 10, strategy: 'balanced', combatStats: {}, skills: [],
  happiness: 100, health: 100, sick: false, species: { id: 'sp', name: 'sp', element: 'fire' }, ...o,
});

describe('combat_mood_bonus (spec 10)', () => {
  it('moodMultiplier: sin bonus no cambia; con bonus multiplica por (1 + bonus)', () => {
    expect(moodMultiplier({ happiness: 100, health: 100 }, cfg)).toBe(1);
    expect(moodMultiplier({ happiness: 100, health: 100 }, cfg, 0.1)).toBe(1.1);
    expect(moodMultiplier({ happiness: 0, health: 0 }, cfg, 0.1)).toBeCloseTo(cfg.mood.minMultiplier * 1.1, 3);
    expect(moodMultiplier({ happiness: 100, health: 100 }, cfg, -0.5)).toBe(1); // nunca penaliza
  });

  it('combatMoodBonuses devuelve el bonus ya recortado al tope, con una sola consulta', async () => {
    // a: altar + trono = 0.1 (tope); b: 3 tronos = 0.18 → 0.1; c: sin muebles
    const { battles, prisma } = makeBattles({
      a: ['shrine_altar', 'final_throne'],
      b: ['final_throne', 'final_throne', 'final_throne'],
      d: ['shrine_altar'],
    });
    const bonuses = await battles.combatMoodBonuses(['a', 'b', 'c', 'd']);
    expect(prisma.habitatItem.findMany).toHaveBeenCalledTimes(1);
    expect(bonuses.get('a')).toBeCloseTo(0.1, 10);
    expect(bonuses.get('b')).toBe(0.1);
    expect(bonuses.get('c')).toBe(0);
    expect(bonuses.get('d')).toBeCloseTo(0.04, 10);
  });

  it('fighterFromPet usa el bonus en el ánimo del luchador', async () => {
    const { battles } = makeBattles({ a: ['shrine_altar'] });
    const bonuses = await battles.combatMoodBonuses(['a', 'z']);
    expect(battles.fighterFromPet(pet('a'), bonuses.get('a')).mood).toBe(1.04);
    expect(battles.fighterFromPet(pet('z'), bonuses.get('z')).mood).toBe(1);
    expect(battles.fighterFromPet(pet('a')).mood).toBe(1); // sin bonus explícito, sin efecto
  });

  it('sin HabitatService no hay bonus (y no falla)', async () => {
    const { battles } = makeBattles({ a: ['shrine_altar'] }, false);
    expect((await battles.combatMoodBonuses(['a'])).size).toBe(0);
  });
});
