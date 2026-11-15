import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Mood Theater (e2e) — camino feliz.
 *
 * Rutas cubiertas (mood-theater.controller.ts, prefijo `/v1`):
 *   - GET  /v1/mood-theater/current — acto espontáneo actual del pet según contexto/vitals.
 *   - POST /v1/mood-theater/capture — captura un momento como sticker (long-press).
 *   - GET  /v1/mood-theater/feed    — feed social opt-in de actos públicos de otros pets.
 *
 * PRECONDICIONES REALES leídas de mood-theater.service.ts / moment-capture.service.ts
 * (sin adivinar):
 *   · `current` valida el pet vía `PetsService.getPetById` (FK ownership). Un pet recién
 *     sembrado con `lastTickAt` = ahora tiene `elapsedHours < 0.01` en `applyLazyTick`, así
 *     que sus vitales quedan INMUTADOS en los defaults (100/100/100/100, no duerme, sano).
 *   · `rollAct` con `context.levelUp=true` devuelve SIEMPRE `glow` (determinístico, no
 *     countable), por lo que `current?levelUp=true` es 100% reproducible. Sin contexto y
 *     con vitales neutros (50) no hay condición que dispare → `act: null`.
 *   · `capture` sin `momentId` captura el MoodMoment más reciente del pet (creado por
 *     `current`) y lo marca `captured=true` con un `stickerKey`; también acepta `momentId`
 *     explícito.
 *   · `feed` lista solo MoodMoment con `sharedToFeed=true` y de OTROS usuarios, con el
 *     nickname/species del pet. Como `current`/`capture` no fijan `sharedToFeed`, aquí se
 *     siembra el momento directamente en Prisma.
 */
describe('Mood Theater: current, capture y feed (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createdUsers: string[] = [];
  const createdPets: string[] = [];
  const createdMoments: string[] = [];

  /** register → /v1/me (userId). */
  async function signup(prefix: string): Promise<{ token: string; userId: string; auth: Record<string, string> }> {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Mood Theater Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);
    return { token, userId, auth: a };
  }


  /**
   * Siembra un pet propio del usuario con la primera species y el primer pattern existentes
   * en BD (ids reales → FK válidas). `vitals` opcional para forzar un estado concreto.
   */
  async function seedPet(
    userId: string,
    nickname: string,
    vitals: { happiness?: number; hunger?: number; energy?: number; health?: number } = {},
  ) {
    const [sp, pat] = await Promise.all([
      prisma.species.findFirst(),
      prisma.pattern.findFirst(),
    ]);
    if (!sp || !pat) throw new Error('BD no sembrada: falta species/pattern');
    const pet = await prisma.pet.create({
      data: {
        userId,
        speciesId: sp.id,
        rarity: 'normal',
        patternId: pat.id,
        palette: { primary: '#123456', secondary: '#654321', accent: '#000000' },
        shiny: false,
        visualSeed: 123456,
        nickname,
        level: 1,
        xp: 0,
        stage: 'baby',
        combatStats: { hp: 100, atk: 50, def: 40, vel: 30, esp: 20 },
        hunger: vitals.hunger ?? 100,
        happiness: vitals.happiness ?? 100,
        energy: vitals.energy ?? 100,
        health: vitals.health ?? 100,
      } as any,
    });
    createdPets.push(pet.id);
    return pet;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdMoments) {
      await prisma.moodMoment.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdPets) {
      await prisma.pet.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });
  describe('GET /v1/mood-theater/current', () => {
    it('a) levelUp=true dispara `glow` determinísticamente y persiste el MoodMoment (200)', async () => {
      const { token, userId, auth: a } = await signup('mood');
      const pet = await seedPet(userId, 'Luminous');

      const res = await api()
        .get('/v1/mood-theater/current')
        .query({ petId: pet.id, levelUp: 'true' })
        .set(a)
        .expect(200);

      // Acto determinístico del config: glow / trigger level_up / duración 3.
      expect(res.body.petId).toBe(pet.id);
      expect(res.body.act).toBe('glow');
      expect(res.body.trigger).toBe('level_up');
      expect(res.body.duration).toBe(3);
      // Pet sano y bien alimentado → mood 'happy'; glow con personalidad nula → 'normal'.
      expect(res.body.mood).toBe('happy');
      expect(res.body.intensity).toBe('normal');
      expect(res.body.momentId).toEqual(expect.any(String));
      expect(res.body.createdAt).toEqual(expect.any(String));

      // El momento quedó persistido sin capturar.
      const moment = await prisma.moodMoment.findUnique({ where: { id: res.body.momentId } });
      expect(moment).toMatchObject({ userId, petId: pet.id, act: 'glow', trigger: 'level_up', captured: false });
      createdMoments.push(res.body.momentId);
    });

    it('b) sin contexto y con vitales neutros → act: null + mensaje (200)', async () => {
      const { token, userId, auth: a } = await signup('mood');
      // Vitals 50: ni bien alimentado (>85/>70), ni bajo (<15/<20), ni enfermo → sin acto.
      const pet = await seedPet(userId, 'Neutral', { happiness: 50, hunger: 50, energy: 50, health: 50 });

      const res = await api()
        .get('/v1/mood-theater/current')
        .query({ petId: pet.id })
        .set(a)
        .expect(200);

      expect(res.body.petId).toBe(pet.id);
      expect(res.body.act).toBeNull();
      expect(res.body.message).toBe('Sin acto en este momento');
    });
  });

  describe('POST /v1/mood-theater/capture', () => {
    it('a) captura el momento más reciente (201) y marca captured=true con stickerKey', async () => {
      const { token, userId, auth: a } = await signup('mood');
      const pet = await seedPet(userId, 'Dancer');

      // `current` crea el momento a capturar.
      const cur = await api()
        .get('/v1/mood-theater/current')
        .query({ petId: pet.id, levelUp: 'true' })
        .set(a)
        .expect(200);
      createdMoments.push(cur.body.momentId);

      // Capturar sin momentId → usa el más reciente (el de `glow`).
      const res = await api()
        .post('/v1/mood-theater/capture')
        .send({ petId: pet.id })
        .set(a)
        .expect(201);

      expect(res.body.momentId).toBe(cur.body.momentId);
      expect(res.body.act).toBe('glow');
      expect(res.body.stickerKey).toMatch(/^mood\//);
      expect(res.body.capturedAt).toEqual(expect.any(String));

      const moment = await prisma.moodMoment.findUnique({ where: { id: cur.body.momentId } });
      expect(moment!.captured).toBe(true);
      expect(moment!.stickerKey).toBe(res.body.stickerKey);
    });

    it('b) captura por momentId explícito (201) y fija stickerKey', async () => {
      const { token, userId, auth: a } = await signup('mood');
      const pet = await seedPet(userId, 'Glow');

      const cur = await api()
        .get('/v1/mood-theater/current')
        .query({ petId: pet.id, levelUp: 'true' })
        .set(a)
        .expect(200);
      createdMoments.push(cur.body.momentId);

      const res = await api()
        .post('/v1/mood-theater/capture')
        .send({ petId: pet.id, momentId: cur.body.momentId })
        .set(a)
        .expect(201);

      expect(res.body.momentId).toBe(cur.body.momentId);
      expect(res.body.stickerKey).toMatch(/^mood\//);
      const moment = await prisma.moodMoment.findUnique({ where: { id: cur.body.momentId } });
      expect(moment!.captured).toBe(true);
      expect(moment!.stickerKey).toBe(res.body.stickerKey);
    });
  });


  describe('GET /v1/mood-theater/feed', () => {
    it('a) devuelve actos públicos de OTROS pets (200) con nickname/species del pet', async () => {
      const viewer = await signup('mood');
      const owner = await signup('mood');
      const petB = await seedPet(owner.userId, 'Social');

      // Momento público de un pet ajeno (sharedToFeed=true, de otro usuario).
      const moment = await prisma.moodMoment.create({
        data: {
          userId: owner.userId,
          petId: petB.id,
          act: 'dance',
          trigger: 'favorite_food',
          mood: 'happy',
          duration: 5,
          sharedToFeed: true,
        },
      });
      createdMoments.push(moment.id);

      const res = await api()
        .get('/v1/mood-theater/feed')
        .set(viewer.auth)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const row = res.body.find((m: any) => m.momentId === moment.id);
      expect(row).toBeDefined();
      expect(row.act).toBe('dance');
      expect(row.trigger).toBe('favorite_food');
      expect(row.captured).toBe(false);
      expect(row.pet).toMatchObject({ nickname: 'Social', species: expect.any(String) });
    });

    it('b) excluye los propios actos del espectador (200)', async () => {
      const { userId, auth: a } = await signup('mood');
      const pet = await seedPet(userId, 'Private');

      // Un momento público PROPIO: debe quedar excluido del feed del mismo usuario.
      const own = await prisma.moodMoment.create({
        data: {
          userId,
          petId: pet.id,
          act: 'sing',
          trigger: 'happy_well_fed',
          mood: 'happy',
          duration: 6,
          sharedToFeed: true,
        },
      });
      createdMoments.push(own.id);

      const res = await api().get('/v1/mood-theater/feed').set(a).expect(200);
      const ownIds = res.body.map((m: any) => m.momentId);
      expect(ownIds).not.toContain(own.id);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});

