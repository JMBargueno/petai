import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Aventura Narrativa IA (e2e) — camino feliz.
 *
 * Rutas cubiertas (adventure.controller.ts):
 *   - POST /v1/adventure/start   → iniciar (gratis o premium con gemas)
 *   - POST /v1/adventure/choose  → elegir opción y avanzar / completar
 *   - GET  /v1/adventure/current → ver aventura en curso
 *   - GET  /v1/adventure/history → historial de aventuras completadas
 *
 * El texto de las escenas se genera por el `AdventureOrchestratorService`: si el usuario no
 * tiene una `AiConfig` con clave cifrada (caso de esta prueba, no hay API key externa), la
 * llamada LLM devuelve `null` y se usa la plantilla determinista de fallback — por lo que el
 * flujo completo (tema, escenas, recompensas) es estable y reproducible. El resultado de la
 * aventura se fuerza a «win» con una mascota de stats altos (nivel, rareza y vínculo) y
 * eligiendo siempre la opción 0 (decisionScore=1): así las recompensas (xp/monedas) son
 * constantes y se pueden afirmar.
 */
describe('Aventura Narrativa IA (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];
  const createdAdventures: string[] = [];

  const PREMIUM_COST = 10; // gems, ver adventure.service.ts

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `adventure_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await api().get('/v1/me').set(auth(token)).expect(200);
    const userId = me.body.id as string;
    createdUsers.push(userId);
    return { token, userId };
  }

  /** Registra un usuario y le crea una mascota (vía huevos), ya preparada para forzar «win». */
  async function signupWithPet(): Promise<{ token: string; userId: string; petId: string }> {
    const { token, userId } = await signup();
    const eggs = await api().get('/v1/eggs').set(auth(token)).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth(token)).expect(201)).body.id as string;
    // Stats altos para que `resolveOutcome` dé siempre «win» (statsScore=1).
    await prisma.pet.update({ where: { id: petId }, data: { level: 50, rarity: 'legendary', bonding: 100, sleeping: false } });
    // Saldo conocido para afirmar deltas.
    await prisma.user.update({ where: { id: userId }, data: { coins: 1000, gems: 50 } });
    return { token, userId, petId };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdAdventures) {
      await prisma.adventure.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  it('a) arranca una aventura gratis: tema, escena 0 con 3 opciones y récord en BD', async () => {
    const { token, petId } = await signupWithPet();

    const res = await api()
      .post('/v1/adventure/start')
      .set(auth(token))
      .send({ petId })
      .expect(201);

    const body = res.body;
    expect(body.adventureId).toBeTruthy();
    expect(body.sceneCount).toBe(3); // gratis = 3 escenas
    expect(body.currentScene).toBe(0);
    expect(body.isPremium).toBe(false);
    expect(body.theme).toBeTruthy();
    expect(typeof body.scene.text).toBe('string');
    expect(body.scene.text.length).toBeGreaterThan(0);
    expect(body.scene.choices).toHaveLength(3);
    createdAdventures.push(body.adventureId);

    const record = await prisma.adventure.findUnique({ where: { id: body.adventureId } });
    expect(record).toMatchObject({ petId, isPremium: false, status: 'active', currentScene: 0, sceneCount: 3 });
  });

  it('b) completa la aventura gratis: 3 elecciones → «win», concede xp/monedas, felicidad y memoria', async () => {
    const { token, userId, petId } = await signupWithPet();

    const started = (await api().post('/v1/adventure/start').set(auth(token)).send({ petId }).expect(201)).body;
    const adventureId = started.adventureId as string;
    createdAdventures.push(adventureId);

    const petBefore = await prisma.pet.findUnique({ where: { id: petId } });
    const userBefore = await prisma.user.findUnique({ where: { id: userId } });

    // Escenas 0 y 1: avanzan.
    for (let i = 0; i < 2; i++) {
      const adv = await api().post('/v1/adventure/choose').set(auth(token)).send({ adventureId, optionIndex: 0 }).expect(201);
      expect(adv.body.advanced).toBe(true);
      expect(adv.body.scene.order).toBe(i + 1);
    }

    // Escena 2 (la última): completa la aventura.
    const final = (await api().post('/v1/adventure/choose').set(auth(token)).send({ adventureId, optionIndex: 0 }).expect(201)).body;
    expect(final.completed).toBe(true);
    expect(final.outcome).toBe('win');
    expect(final.rewards).toEqual({ xp: 30, coins: 20 });
    expect(final.score).toBeGreaterThan(0.7);
    expect(typeof final.memory).toBe('string');

    // Deltas en BD: +30 xp y +8 felicidad al pet (win); +20 monedas al usuario.
    const petAfter = await prisma.pet.findUnique({ where: { id: petId } });
    const userAfter = await prisma.user.findUnique({ where: { id: userId } });
    expect(petAfter!.xp - petBefore!.xp).toBe(30);
    expect(petAfter!.happiness - petBefore!.happiness).toBe(8);
    expect(userAfter!.coins - userBefore!.coins).toBe(20);

    // Récord de aventura: completado con resultado y recompensas guardados.
    const record = await prisma.adventure.findUnique({ where: { id: adventureId } });
    expect(record).toMatchObject({ status: 'completed', outcome: 'win', xpAwarded: 30, coinsAwarded: 20 });
    expect(record!.finishedAt).not.toBeNull();

    // Se crea una memoria de tipo «adventure» para el pet.
    const memory = await prisma.petMemory.findFirst({ where: { petId, kind: 'adventure' } });
    expect(memory).not.toBeNull();
    expect(memory!.content).toContain('Adventuré');

    // El historial ya incluye la aventura completada.
    const history = (await api().get('/v1/adventure/history').set(auth(token)).expect(200)).body;
    const entry = history.find((h: any) => h.adventureId === adventureId);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ outcome: 'win', xpAwarded: 30, coinsAwarded: 20 });
  });

  it('c) /adventure/current refleja el estado durante el curso y termina cuando se completa', async () => {
    const { token, petId } = await signupWithPet();
    const started = (await api().post('/v1/adventure/start').set(auth(token)).send({ petId }).expect(201)).body;
    const adventureId = started.adventureId as string;
    createdAdventures.push(adventureId);

    // En curso: escena 0.
    const cur = (await api().get('/v1/adventure/current').set(auth(token)).expect(200)).body;
    expect(cur.active).toBe(true);
    expect(cur.adventureId).toBe(adventureId);
    expect(cur.currentScene).toBe(0);
    expect(cur.scene.order).toBe(0);

    // 3 escenas → 3 elecciones para cerrar.
    await api().post('/v1/adventure/choose').set(auth(token)).send({ adventureId, optionIndex: 0 }).expect(201);
    await api().post('/v1/adventure/choose').set(auth(token)).send({ adventureId, optionIndex: 0 }).expect(201);
    await api().post('/v1/adventure/choose').set(auth(token)).send({ adventureId, optionIndex: 0 }).expect(201);

    // Ya no hay aventura activa.
    const after = (await api().get('/v1/adventure/current').set(auth(token)).expect(200)).body;
    expect(after.active).toBe(false);
  });

  it('d) aventura premium: cobra 10 gemas y genera 5 escenas', async () => {
    const { token, userId, petId } = await signupWithPet();
    const gemsBefore = (await prisma.user.findUnique({ where: { id: userId } }))!.gems;

    const res = await api()
      .post('/v1/adventure/start')
      .set(auth(token))
      .send({ petId, premium: true })
      .expect(201);

    const body = res.body;
    expect(body.isPremium).toBe(true);
    expect(body.sceneCount).toBe(5);
    expect(body.retriesLeft).toBe(1);
    createdAdventures.push(body.adventureId);

    const gemsAfter = (await prisma.user.findUnique({ where: { id: userId } }))!.gems;
    expect(gemsBefore - gemsAfter).toBe(PREMIUM_COST);
    const record = await prisma.adventure.findUnique({ where: { id: body.adventureId } });
    expect(record).toMatchObject({ isPremium: true, sceneCount: 5, status: 'active', retriesLeft: 1 });
  });

  it('e) sin autenticación las rutas de aventura responden 401', async () => {
    await api().get('/v1/adventure/current').expect(401);
    await api().get('/v1/adventure/history').expect(401);
    await api().post('/v1/adventure/start').send({ petId: 'x' }).expect(401);
    await api().post('/v1/adventure/choose').send({ adventureId: 'x', optionIndex: 0 }).expect(401);
  });
});