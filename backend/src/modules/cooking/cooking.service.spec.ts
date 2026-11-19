import { readFileSync } from 'fs';
import { join } from 'path';
import { CookingService } from './cooking.service';

const DATA = join(__dirname, '../../../../shared/game-data');
const json = (file: string) => JSON.parse(readFileSync(join(DATA, `${file}.json`), 'utf8'));
/** Los game-data de verdad: las recetas ya no están copiadas en el servicio. */
const gameData = { readFileFromDisk: (file: string) => json(file), getFoods: () => json('foods') };

/**
 * Tests de la acotación de recompensas en `CookingService.submit` (S-12): `score`/`correctOrder`
 * los afirma el cliente, así que `correctCount` debe acotarse a [0, ingredientes] para que
 * `pct <= 1` y no se pueda inflar buff/monedas con una puntuación desorbitada.
 */
function buildService(session: any) {
  const prismaMock = {
    cookingSession: {
      findFirst: jest.fn(async () => session),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
    },
    user: { update: jest.fn(async () => ({})) },
  };
  const service = new CookingService(prismaMock as never, gameData as never, {} as never);
  return { service, prismaMock };
}

const session = (id: string, ingredients: string[]) => ({
  id, userId: 'u1', petId: 'p1', recipeId: 'starter_soup', ingredients,
  startedAt: new Date(), finishedAt: null,
});

describe('CookingService.submit (S-12 acotación de recompensas)', () => {
  it('acota un score malicioso desorbitado a la longitud de la receta', async () => {
    const { service, prismaMock } = buildService(session('s1', ['apple', 'healthy_salad', 'sun_seed']));

    // Sin acotado: correctCount = floor(999999/25) = 39999 → pct ~13333 → coins ~533360.
    const res = await service.submit('u1', 's1', 999999, false);

    expect(res.score).toBe(3); // correctCount acotado a ingredientes.length
    expect(res.correctPct).toBe(100); // pct = 1
    expect(res.coins).toBe(40); // Math.floor(1 * 40), el máximo
    expect(res.buff?.stat).toBe('atk'); // buff de la receta (máx., pero acotado)
    // Las monedas incrementadas en BD no superan el techo.
    const inc = (prismaMock.user.update.mock.calls as unknown as any[][]).map((c) => c[0]?.data?.coins?.increment).find((v) => v != null);
    expect(inc).toBe(40);
  });

  it('un score normal se convierte en correctCount = floor(score/25)', async () => {
    const { service } = buildService(session('s2', ['apple', 'healthy_salad', 'sun_seed']));
    const res = await service.submit('u1', 's2', 25, false); // floor(25/25)=1 → pct=1/3
    expect(res.score).toBe(1);
    expect(res.correctPct).toBe(33);
    expect(res.coins).toBe(13); // floor(1/3 * 40)
    expect(res.buff).toBeNull(); // pct < 0.75 → sin buff
  });

  it('con picked, el servidor cuenta los aciertos contra la receta y no se fía del cliente', async () => {
    const { service } = buildService(session('s4', ['sun_seed', 'apple', 'cake', 'healthy_salad']));
    // Dice que lo hizo perfecto, pero echó a la olla un señuelo en segundo lugar.
    const res = await service.submit('u1', 's4', 75, true, ['apple', 'cake', 'sun_seed']);
    expect(res.score).toBe(2);
    expect(res.correctPct).toBe(67);
    expect(res.buff).toBeNull();
  });

  it('con picked completo y en orden, plato perfecto', async () => {
    const { service } = buildService(session('s5', ['sun_seed', 'apple', 'cake', 'healthy_salad']));
    const res = await service.submit('u1', 's5', 0, false, ['apple', 'healthy_salad', 'sun_seed']);
    expect(res.correctPct).toBe(100);
    expect(res.buff?.value).toBe(5);
  });

  it('rechaza un picked que no es una lista de textos', async () => {
    const { service } = buildService(session('s6', ['apple']));
    await expect(service.submit('u1', 's6', 0, false, 'apple' as unknown as string[])).rejects.toThrow('picked inválido');
  });

  it('las recetas solo usan comida que existe, y los señuelos no repiten ingredientes', () => {
    const foods = new Set((json('foods') as { id: string; kind: string }[]).filter((f) => f.kind === 'food').map((f) => f.id));
    const { service } = buildService(session('s7', []));
    for (const recipe of json('recipes') as { id: string; difficulty: number; ingredients: string[] }[]) {
      for (const ing of recipe.ingredients) expect(foods.has(ing)).toBe(true);
      const shown = (service as unknown as { withDecoys(r: unknown, seed: number): string[] }).withDecoys(recipe, 1234);
      expect(new Set(shown).size).toBe(shown.length);
      expect(shown.length).toBeGreaterThan(recipe.ingredients.length);
      expect(shown.slice(0, recipe.ingredients.length)).toEqual(recipe.ingredients);
    }
  });

  it('rechaza score no numérico', async () => {
    const { service } = buildService(session('s3', ['a']));
    await expect(service.submit('u1', 's3', 'hola' as unknown as number, false)).rejects.toThrow('score y correctOrder inválidos');
  });
});