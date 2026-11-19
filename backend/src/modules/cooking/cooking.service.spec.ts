import { readFileSync } from 'fs';
import { join } from 'path';
import { CookingService, alignPicked } from './cooking.service';
import { applyStatBuffs } from '../battles/combat/stats';

const DATA = join(__dirname, '../../../../shared/game-data');
const json = (file: string) => JSON.parse(readFileSync(join(DATA, `${file}.json`), 'utf8'));
/** Los game-data de verdad: recetas, comida y `balance.cooking`. */
const gameData = { readFileFromDisk: (file: string) => json(file), getFoods: () => json('foods'), getBalance: () => json('balance') };
const cfg = json('balance').cooking;
const recipes = json('recipes') as { id: string; difficulty: number; ingredients: string[]; dailyMenu?: boolean; weekday?: number; unlockLevel: number; buff: { stat: string; value: number } }[];

function buildService(session: any, pet: any = { level: 1, energy: 100, sleeping: false }) {
  const buffs = new Map<string, any>();
  const prismaMock = {
    cookingSession: {
      findFirst: jest.fn(async (q: any) => (q?.where?.id ? session : null)),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      groupBy: jest.fn(async () => [{ recipeId: 'starter_soup', _max: { score: 3 } }]),
    },
    combatBuff: {
      findUnique: jest.fn(async ({ where }: any) => buffs.get(JSON.stringify(where.petId_stat_source)) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = JSON.stringify(where.petId_stat_source);
        buffs.set(k, { ...(buffs.get(k) ?? create), ...update });
      }),
    },
    pet: { updateMany: jest.fn(async () => ({ count: 1 })), findUnique: jest.fn(async () => null) },
    user: { update: jest.fn(async () => ({})) },
  };
  const pets = { getPetById: jest.fn(async () => pet) };
  const service = new CookingService(prismaMock as never, gameData as never, pets as never);
  return { service, prismaMock, buffs };
}

/** Sesión empezada hace `agoMs` (por defecto 10 s: ya pasó el dictado, queda tiempo de sobra). */
const session = (id: string, recipeId: string, hotPotPositions: number[] = [], agoMs = 10_000) => ({
  id, userId: 'u1', petId: 'p1', recipeId, ingredients: [], hotPotPositions,
  startedAt: new Date(Date.now() - agoMs), finishedAt: null,
});
const recipe = (id: string) => recipes.find((r) => r.id === id)!;

describe('alignPicked', () => {
  it('un olvido o un señuelo en medio no desplaza lo que va detrás', () => {
    expect(alignPicked(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toEqual([0, -1, 1, 2]);
    expect(alignPicked(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toEqual([0, 2, 3]);
    expect(alignPicked(['a', 'b'], [])).toEqual([-1, -1]);
  });
});

describe('CookingService.submit', () => {
  it('acota un score malicioso desorbitado a la longitud de la receta (S-12)', async () => {
    const { service, prismaMock } = buildService(session('s1', 'starter_soup'));
    const res = await service.submit('u1', 's1', 999999, false);
    expect(res.score).toBe(3);
    expect(res.correctPct).toBe(100);
    expect(res.coins).toBeLessThanOrEqual(cfg.coins.max + cfg.coins.speedBonusMax);
    const inc = (prismaMock.user.update.mock.calls as unknown as any[][]).map((c) => c[0]?.data?.coins?.increment).find((v) => v != null);
    expect(inc).toBe(res.coins);
  });

  it('un score normal se convierte en correctCount = floor(score/25)', async () => {
    const { service } = buildService(session('s2', 'starter_soup'));
    const res = await service.submit('u1', 's2', 25, false);
    expect(res.score).toBe(1);
    expect(res.grade).toBe('bad');
    expect(res.buff).toBeNull();
  });

  it('con picked, un ingrediente olvidado solo cuenta como un fallo (sin cascada)', async () => {
    const r = recipe('elemental_brew'); // 4 ingredientes
    const { service } = buildService(session('s3', r.id));
    const res = await service.submit('u1', 's3', 0, true, [r.ingredients[0], r.ingredients[2], r.ingredients[3]]);
    expect(res.score).toBe(3);
    expect(res.slots).toEqual(['ok', 'miss', 'ok', 'ok']);
    expect(res.grade).toBe('good'); // 75 % ≥ umbral bueno
    expect(res.buff?.value).toBe(Math.max(1, Math.round(r.buff.value * cfg.goodBuffFactor)));
  });

  it('plato perfecto: buff completo guardado en CombatBuff y bonus por rapidez', async () => {
    const { service, buffs } = buildService(session('s4', 'starter_soup'));
    const res = await service.submit('u1', 's4', 0, false, recipe('starter_soup').ingredients);
    expect(res.grade).toBe('perfect');
    expect(res.buff?.value).toBe(recipe('starter_soup').buff.value);
    expect(res.speedBonus).toBeGreaterThan(0);
    expect(res.coins).toBe(cfg.coins.max + res.speedBonus);
    expect([...buffs.values()][0]).toMatchObject({ petId: 'p1', stat: 'atk', value: 5, source: 'cooking' });
  });

  it('el menú del día multiplica el buff y lo reparte a las cuatro stats', async () => {
    const menu = recipes.find((r) => r.dailyMenu)!;
    const { service, buffs } = buildService(session('s5', menu.id, [], 20_000));
    const res = await service.submit('u1', 's5', 0, false, menu.ingredients);
    expect(res.buff?.value).toBe(Math.round(menu.buff.value * cfg.dailyMenuBuffFactor));
    expect([...buffs.values()].map((b) => b.stat).sort()).toEqual(['atk', 'def', 'esp', 'vel']);
  });

  it('olla caliente: si el ingrediente llega tarde se quema', async () => {
    const r = recipe('storm_roast');
    const { service } = buildService(session('s6', r.id, [2]));
    const late = 99_000;
    const res = await service.submit('u1', 's6', 0, true, r.ingredients, [500, 1000, 1000 + late / 10, 1000 + late / 10 + 300]);
    expect(res.slots[2]).toBe('burned');
    expect(res.slots.filter((s) => s === 'ok')).toHaveLength(3);
  });

  it('rechaza envíos imposiblemente rápidos', async () => {
    const { service } = buildService(session('s7', 'starter_soup', [], 100));
    const res = await service.submit('u1', 's7', 0, true, recipe('starter_soup').ingredients);
    expect(res.score).toBe(0);
    expect(res.message).toBe('Demasiado rápido');
  });

  it('rechaza un picked o un pickedAt mal formados', async () => {
    const { service } = buildService(session('s8', 'starter_soup'));
    await expect(service.submit('u1', 's8', 0, false, 'apple' as unknown as string[])).rejects.toThrow('picked inválido');
    await expect(service.submit('u1', 's8', 0, false, ['apple'], [5, 1])).rejects.toThrow('pickedAt inválido');
    await expect(service.submit('u1', 's8', 'hola' as unknown as number, false)).rejects.toThrow('score y correctOrder inválidos');
  });
});

describe('CookingService.start y recetario', () => {
  it('sin receta cocina el menú de hoy, con ritmo y tiempo según la dificultad', async () => {
    const { service } = buildService(null);
    const res = await service.start('u1', 'p1');
    const today = recipes.find((r) => r.dailyMenu && r.weekday === new Date().getUTCDay())!;
    expect(res.recipeId).toBe(today.id);
    expect(res.isDailyMenu).toBe(true);
    expect(res.revealMs).toBe(cfg.revealMsByDifficulty[today.difficulty - 1]);
    expect(res.durationSeconds).toBe(cfg.durationSecondsByDifficulty[today.difficulty - 1]);
    for (const p of res.hotPotPositions) expect(p).toBeGreaterThan(0);
  });

  it('rechaza recetas bloqueadas por nivel y menús de otro día', async () => {
    const { service } = buildService(null);
    await expect(service.start('u1', 'p1', 'mythic_feast')).rejects.toThrow('nivel 50');
    const other = recipes.find((r) => r.dailyMenu && r.weekday !== new Date().getUTCDay())!;
    await expect(service.start('u1', 'p1', other.id)).rejects.toThrow('no es el de hoy');
  });

  it('el recetario oculta los ingredientes de lo que aún no se puede cocinar', async () => {
    const { service } = buildService(null);
    const book = await service.recipeBook('u1', 'p1');
    expect(book.filter((r) => r.today)).toHaveLength(1);
    expect(book.find((r) => r.id === 'mythic_feast')!.ingredients).toBeNull();
    expect(book.find((r) => r.id === 'starter_soup')).toMatchObject({ available: true, best: 3, perfect: true });
  });

  it('las recetas solo usan comida que existe, y los señuelos no repiten ingredientes', () => {
    const foods = new Set((json('foods') as { id: string; kind: string }[]).filter((f) => f.kind === 'food').map((f) => f.id));
    const { service } = buildService(null);
    for (const r of recipes) {
      for (const ing of r.ingredients) expect(foods.has(ing)).toBe(true);
      const shown = (service as unknown as { withDecoys(r: unknown, seed: number): string[] }).withDecoys(r, 1234);
      expect(new Set(shown).size).toBe(shown.length);
      expect(shown.length).toBeGreaterThan(r.ingredients.length);
    }
  });
});

describe('applyStatBuffs', () => {
  it('suma el buff con tope sobre la stat sin buff', () => {
    const base = { hp: 100, atk: 30, def: 20, vel: 10, esp: 40 };
    const out = applyStatBuffs(base, { atk: 8, def: 1 }, 0.15);
    expect(out.atk).toBe(30 + 5); // tope round(30·0.15)=5
    expect(out.def).toBe(21);
    expect(out.esp).toBe(40);
  });
});
