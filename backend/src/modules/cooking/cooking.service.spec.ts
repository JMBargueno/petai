import { CookingService } from './cooking.service';

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
  const service = new CookingService(prismaMock as never, {} as never, {} as never);
  return { service, prismaMock };
}

const session = (id: string, ingredients: string[]) => ({
  id, userId: 'u1', petId: 'p1', recipeId: 'starter_soup', ingredients,
  startedAt: new Date(), finishedAt: null,
});

describe('CookingService.submit (S-12 acotación de recompensas)', () => {
  it('acota un score malicioso desorbitado a la longitud de la receta', async () => {
    const { service, prismaMock } = buildService(session('s1', ['carrot', 'onion', 'water']));

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
    const { service } = buildService(session('s2', ['carrot', 'onion', 'water']));
    const res = await service.submit('u1', 's2', 25, false); // floor(25/25)=1 → pct=1/3
    expect(res.score).toBe(1);
    expect(res.correctPct).toBe(33);
    expect(res.coins).toBe(13); // floor(1/3 * 40)
    expect(res.buff).toBeNull(); // pct < 0.75 → sin buff
  });

  it('rechaza score no numérico', async () => {
    const { service } = buildService(session('s3', ['a']));
    await expect(service.submit('u1', 's3', 'hola' as unknown as number, false)).rejects.toThrow('score y correctOrder inválidos');
  });
});