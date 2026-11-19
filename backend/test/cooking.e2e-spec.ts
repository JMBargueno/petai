import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cooking / Menú del día (e2e) — camino feliz (feature 015).
 *
 * Cubre las rutas del módulo `cooking` (cooking.controller.ts):
 *   POST /v1/cooking/start       → sesión con receta (la pedida o el menú del día), orden y timer.
 *   POST /v1/cooking/submit      → valida el resultado y guarda el buff en CombatBuff + monedas.
 *   GET  /v1/cooking/recipes     → recetario con lo desbloqueado y la mejor nota.
 *   GET  /v1/cooking/daily-menu  → el menú propio de hoy (uno por día de la semana, UTC).
 *
 * Las constantes viven en balance.json → cooking.
 *
 * Precondiciones reales leídas del service (cooking.service.ts), no adivinadas:
 *   · start: el pet debe existir (getPetById), NO estar durmiendo (pet.sleeping=false),
 *     tener pet.energy >= ENERGY_COST (=10), tener < DAILY_LIMIT (=20) sesiones en las
 *     últimas 24 h, respetar el cooldown de COOLDOWN_SECONDS (=15 s) desde la última
 *     sesión, y pet.level >= unlockLevel de al menos una receta (=1, `starter_soup`).
 *   · submit: `score` (number) + `correctOrder` (boolean) + `picked` (lo que se echó a la olla).
 *     Con `picked` el servidor cuenta los aciertos contra la receta e ignora los otros dos; la
 *     receta entera y en orden ⇒ pct=1 ⇒ buff al 100% y coins = floor(1*40)=40.
 *   · daily-menu: solo requiere auth; la receta se elige con hashSeed(`daily:YYYY-MM-DD`)
 *     y es determinista dentro de un mismo día.
 *
 * Cada prueba crea un entrenador + mascota frescos (nivel 30, energía 100, no durmiendo,
 * lastTickAt actual) para que el límite diario y el cooldown no interpongan. La receta de
 * `start` es aleatoria entre las desbloqueadas, así que se asertan invariantes (shape,
 * duración, buff presente) y no el stat concreto del buff.
 */
describe('Cooking: cocina, submit y menú del día (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdUsers: string[] = [];

  const KNOWN_STATS = ['atk', 'def', 'esp', 'vel'];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const COOKING = require('../../shared/game-data/balance.json').cooking;
  const BUFF_DURATION_MS = 24 * 3600 * 1000;

  type U = { token: string; userId: string; petId: string; auth: Record<string, string> };

  /**
   * Crea un entrenador + mascota con las precondiciones mínimas para cocinar:
   * register → GET /v1/eggs → POST /v1/eggs/:id/hatch (petId) → GET /v1/me (userId),
   * y luego fija nivel 30, energía 100, sleeping=false y lastTickAt actual.
   */
  async function signup(): Promise<U> {
    const email = `cook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Cook Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)).body
      .id as string;
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);

    await prisma.pet.update({
      where: { id: petId },
      data: { level: 30, sleeping: false, energy: 100, lastTickAt: new Date() },
    });
    return { token, userId, petId, auth: a };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  it('POST /v1/cooking/start inicia una sesión (receta, orden, timer y descuento de energía)', async () => {
    const { auth: a, petId } = await signup();

    const start = await api()
      .post('/v1/cooking/start')
      .set(a)
      .send({ petId })
      .expect(201);

    const body = start.body;
    // Shape real de CookingService.start.
    expect(typeof body.sessionId).toBe('string');
    expect(typeof body.recipeId).toBe('string');
    expect(typeof body.recipeName).toBe('string');
    expect(typeof body.difficulty).toBe('number');
    expect(Array.isArray(body.ingredients)).toBe(true);
    expect(body.ingredients.length).toBeGreaterThan(0);
    // `order` es la encimera: todos los ingredientes de la receta más al menos un señuelo,
    // barajados y sin repetir.
    expect(Array.isArray(body.order)).toBe(true);
    expect(body.order.length).toBeGreaterThan(body.ingredients.length);
    expect(new Set(body.order).size).toBe(body.order.length);
    for (const ing of body.ingredients) expect(body.order).toContain(ing);
    expect(Array.isArray(body.hotPotPositions)).toBe(true);
    expect(body.durationSeconds).toBe(COOKING.durationSecondsByDifficulty[body.difficulty - 1]);
    expect(body.isDailyMenu).toBe(true); // sin recipeId se cocina el menú del día
    expect(typeof body.seed).toBe('number');
    expect(typeof body.expiresAt).toBe('string');

    // Efecto real en BD: sesión creada (finishedAt nulo) y energía descontada (100 → 90).
    const session = await prisma.cookingSession.findFirst({
      where: { id: body.sessionId, petId },
    });
    expect(session).not.toBeNull();
    expect(session!.finishedAt).toBeNull();
    expect(session!.recipeId).toBe(body.recipeId);
    expect((await prisma.pet.findUniqueOrThrow({ where: { id: petId } })).energy).toBe(90);
  });

  it('POST /v1/cooking/submit con la receta entera otorga buff al 100% (en CombatBuff) y monedas', async () => {
    const { auth: a, userId, petId } = await signup();

    const start = await api()
      .post('/v1/cooking/start')
      .set(a)
      .send({ petId, recipeId: 'starter_soup' })
      .expect(201);
    const sessionId = start.body.sessionId as string;
    // Como si el jugador hubiera tardado 10 s (el servidor rechaza los envíos más rápidos que el dictado)
    await prisma.cookingSession.update({ where: { id: sessionId }, data: { startedAt: new Date(Date.now() - 10_000) } });
    const ingredientsCount = (start.body.ingredients as string[]).length;

    const coinsBefore = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;

    // Se manda la receta entera y en orden en `picked`: el servidor cuenta los aciertos él mismo
    // (pct=1 ⇒ buff full + coins=40) aunque `score` y `correctOrder` digan lo contrario.
    const submit = await api()
      .post('/v1/cooking/submit')
      .set(a)
      .send({ sessionId, score: 0, correctOrder: false, picked: start.body.ingredients })
      .expect(201);

    const body = submit.body;
    expect(body.score).toBe(ingredientsCount);
    expect(body.correctPct).toBe(100);
    expect(body.grade).toBe('perfect');
    expect(body.coins).toBe(COOKING.coins.max + body.speedBonus);
    // La receta elegida es aleatoria entre las desbloqueadas (nivel 30), por lo que el stat
    // del buff varía; se valida que existe, viene de cocina, con valor positivo y 24 h.
    expect(body.buff).not.toBeNull();
    expect(body.buff.source).toBe('cooking');
    expect(KNOWN_STATS).toContain(body.buff.stat);
    expect(body.buff.value).toBeGreaterThan(0);
    expect(body.buff.durationMs).toBe(BUFF_DURATION_MS);
    expect(body.buff.recipeId).toBe(start.body.recipeId);

    // Efecto real en BD: sesión finalizada, buffApplied=true, score guardado y +40 monedas.
    const session = await prisma.cookingSession.findUnique({ where: { id: sessionId } });
    expect(session!.finishedAt).not.toBeNull();
    expect(session!.buffApplied).toBe(true);
    expect(session!.score).toBe(ingredientsCount);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins).toBe(
      coinsBefore + body.coins,
    );
    const buffRow = await prisma.combatBuff.findFirst({ where: { petId, source: 'cooking' } });
    expect(buffRow).toMatchObject({ stat: body.buff.stat, value: body.buff.value });
    const active = await api().get('/v1/cooking/buffs').query({ petId }).set(a).expect(200);
    expect(active.body).toHaveLength(1);
  });

  it('GET /v1/cooking/recipes devuelve el recetario con el menú de hoy', async () => {
    const { auth: a, petId } = await signup();
    const res = await api().get('/v1/cooking/recipes').query({ petId }).set(a).expect(200);
    expect(res.body.filter((r: any) => r.today)).toHaveLength(1);
    expect(res.body.find((r: any) => r.id === 'mythic_feast').available).toBe(false); // nivel 30 < 50
  });

  it('GET /v1/cooking/daily-menu devuelve la receta del día (determinista por fecha)', async () => {
    const { auth: a } = await signup();

    const res = await api().get('/v1/cooking/daily-menu').set(a).expect(200);

    const today = new Date().toISOString().split('T')[0];
    expect(res.body.date).toBe(today);
    expect(typeof res.body.recipeId).toBe('string');
    expect(typeof res.body.recipeName).toBe('string');
    expect(typeof res.body.difficulty).toBe('number');
    expect(Array.isArray(res.body.ingredients)).toBe(true);
    expect(res.body.ingredients.length).toBeGreaterThan(0);
    expect(res.body.buff).toMatchObject({ stat: expect.any(String), value: expect.any(Number) });
    expect(typeof res.body.bonus).toBe('string');
    expect(res.body.weekday).toBe(new Date().getUTCDay());

    // Determinista por fecha: dos lecturas el mismo día devuelven la misma receta.
    const res2 = await api().get('/v1/cooking/daily-menu').set(a).expect(200);
    expect(res2.body.recipeId).toBe(res.body.recipeId);
    expect(res2.body.recipeName).toBe(res.body.recipeName);
  });
});
