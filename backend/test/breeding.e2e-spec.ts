import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Breeding / Cría de pets (e2e) — camino feliz.
 *
 * Cubre las 3 rutas públicas del módulo `breeding` (breeding.controller.ts):
 *   - POST /v1/breeding/start     → inicia una cría entre dos pets propios (201).
 *   - GET  /v1/breeding/:id       → estado de una cría (in_progress con result=null,
 *                                   y completed con su descendencia).
 *   - GET  /v1/breeding/history   → historial de crías del usuario (take 50, orden desc).
 *
 * PRECONDICIONES REALES leídas de breeding.service.ts (sin adivinar):
 *   · startBreeding NO cobra monedas, no exige nivel ni objetos. Solo requiere:
 *       1. parent1 y parent2 sean PETS PROPIOS del usuario (Pet.userId === user.id).
 *       2. parent1Id !== parent2Id.
 *       3. Menos de MAX_SIMULTANEOUS (3) crías `in_progress`.
 *       4. Ningún progenitor con cooldown: última cría `completed` con
 *          completesAt dentro de COOLDOWN_MS (1h) bloquea (nuevos pets → sin cooldown).
 *   · Un usuario recién registrado recibe UN huevo starter (auth.service.ts:74,
 *     hatchesAt = now). Por eso, para obtener dos progenitores distintos:
 *       - eclosionamos el huevo → pet A
 *       - sembramos pet B directamente en Prisma (speciesId/patternId reales de BD).
 *   · El happy path de un estado `completed` lo sembramos de forma determinista
 *     (breeding + BreedingResult + descendiente) y lo leemos, sin depender de la
 *     aleatoriedad del motor de genética (checkAndComplete).
 */
describe('Breeding: cría, estado e historial (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdUsers: string[] = [];

  type U = {
    token: string;
    userId: string;
    pet1Id: string;
    pet2Id: string;
    auth: Record<string, string>;
  };

  /**
   * Siembra un pet propio del usuario usando la primera species y el primer pattern
   * existentes en BD (ids reales → FK válidas). Determinista: sin aleatoriedad.
   */
  async function seedPet(userId: string, nickname: string) {
    const [sp, pat] = await Promise.all([
      prisma.species.findFirst(),
      prisma.pattern.findFirst(),
    ]);
    if (!sp || !pat) throw new Error('BD no sembrada: falta species/pattern');
    return prisma.pet.create({
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
      },
    });
  }

  /**
   * Helper: register → /v1/me (userId) → eclosionar huevo (pet1) → sembrar pet2 en BD.
   * Devuelve dos progenitores distintos y propios, listos para el happy path de `start`.
   */
  async function makeUser(): Promise<U> {
    const email = `breed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Breeding Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);

    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);

    // Pet A: eclosionar el huevo starter de bienvenida.
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    const pet1Id = (
      await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)
    ).body.id as string;

    // Pet B: sembrado directamente (necesario porque solo hay 1 huevo por registro).
    const pet2 = await seedPet(userId, 'Progenitor B');

    return { token, userId, pet1Id, pet2Id: pet2.id, auth: a };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // POST /v1/breeding/start
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('POST /v1/breeding/start', () => {
    it('a) inicia una cría entre dos pets propios → 201 con shape y efecto en BD', async () => {
      const { pet1Id, pet2Id, userId, auth: a } = await makeUser();
      const before = Date.now();

      const res = await api()
        .post('/v1/breeding/start')
        .set(a)
        .send({ parent1Id: pet1Id, parent2Id: pet2Id })
        .expect(201);
      const b = res.body;

      // Shape del happy path (breeding.service.ts:58-66).
      expect(b.id).toEqual(expect.any(String));
      expect(b.status).toBe('in_progress');
      expect(b.parent1).toMatchObject({ id: pet1Id });
      expect(b.parent2).toMatchObject({ id: pet2Id });
      expect(typeof b.parent1.nickname).toBe('string');
      expect(b.parent1.speciesId).toEqual(expect.any(String));
      expect(b.estimatedMinutes).toBe(120); // BREEDING_DURATION_MS / 60000 = 2h
      expect(typeof b.startedAt).toBe('string');
      expect(typeof b.completesAt).toBe('string');

      // completesAt ≈ now + 2h (2 * 60 * 60 * 1000).
      const completes = new Date(b.completesAt).getTime();
      expect(completes).toBeGreaterThan(before + 119 * 60 * 1000);
      expect(completes).toBeLessThanOrEqual(Date.now() + 121 * 60 * 1000);

      // Efecto real en BD: cría `in_progress` vinculada al usuario y a ambos progenitores.
      const row = await prisma.breeding.findUnique({ where: { id: b.id } });
      expect(row).not.toBeNull();
      expect(row!.userId).toBe(userId);
      expect(row!.status).toBe('in_progress');
      expect(row!.parent1Id).toBe(pet1Id);
      expect(row!.parent2Id).toBe(pet2Id);
    });

    it('b) 401 sin token', async () => {
      await api().post('/v1/breeding/start').send({}).expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // GET /v1/breeding/:id
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/breeding/:id', () => {
    it('c) cría in_progress → 200 con result=null y timeRemaining>0', async () => {
      const { pet1Id, pet2Id, auth: a } = await makeUser();
      const start = await api()
        .post('/v1/breeding/start')
        .set(a)
        .send({ parent1Id: pet1Id, parent2Id: pet2Id })
        .expect(201);
      const id = start.body.id as string;

      const res = await api().get(`/v1/breeding/${id}`).set(a).expect(200);
      const b = res.body;

      expect(b.id).toBe(id);
      expect(b.status).toBe('in_progress');
      expect(b.result).toBeNull(); // aún no ha completado (completesAt en +2h)
      expect(b.timeRemainingMs).toBeGreaterThan(0);
      expect(b.parent1).toMatchObject({ id: pet1Id });
      expect(b.parent2).toMatchObject({ id: pet2Id });
      expect(typeof b.parent1.nickname).toBe('string');
      expect(typeof b.startedAt).toBe('string');
      expect(typeof b.completesAt).toBe('string');
    });

    it('d) cría completed → 200 con su result (descendiente y mutaciones)', async () => {
      const { userId, auth: a } = await makeUser();
      // Dos progenitores + un descendiente (seed determinista).
      const p1 = await seedPet(userId, 'Comp A');
      const p2 = await seedPet(userId, 'Comp B');
      const offspring = await seedPet(userId, 'Offspring');

      // Estado mínimo para leer un `completed` sin depender del motor genético:
      // breeding(completed) + BreedingResult + descendiente.
      const breeding = await prisma.breeding.create({
        data: {
          userId,
          parent1Id: p1.id,
          parent2Id: p2.id,
          status: 'completed',
          startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          completesAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          seed: 424242,
        },
      });
      await prisma.breedingResult.create({
        data: {
          breedingId: breeding.id,
          offspringId: offspring.id,
          inheritedGenes: { fromParent1: ['element', 'rarity'], fromParent2: ['patternId'] },
          mutations: [{ gene: 'shiny', originalValue: 'false', mutatedValue: 'true' }],
        },
      });

      const res = await api().get(`/v1/breeding/${breeding.id}`).set(a).expect(200);
      const b = res.body;

      expect(b.id).toBe(breeding.id);
      expect(b.status).toBe('completed');
      expect(b.result).not.toBeNull();
      expect(b.result.offspringId).toBe(offspring.id);
      expect(Array.isArray(b.result.mutations)).toBe(true);
      expect(b.parent1).toMatchObject({ id: p1.id });
      expect(b.parent2).toMatchObject({ id: p2.id });
    });

    it('e) 404 si la cría no existe y 401 sin token', async () => {
      const { auth: a } = await makeUser();
      await api()
        .get('/v1/breeding/00000000-0000-0000-0000-000000000000')
        .set(a)
        .expect(404);
      await api()
        .get('/v1/breeding/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // GET /v1/breeding/history
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/breeding/history', () => {
    it('f) lista las crías del usuario (in_progress y completed) en shape correcto', async () => {
      const { pet1Id, pet2Id, userId, auth: a } = await makeUser();

      // Una cría in_progress (por la API) y una completed (sembrada con result).
      const started = await api()
        .post('/v1/breeding/start')
        .set(a)
        .send({ parent1Id: pet1Id, parent2Id: pet2Id })
        .expect(201);

      const comp1 = await seedPet(userId, 'Hist A');
      const comp2 = await seedPet(userId, 'Hist B');
      const compOffspring = await seedPet(userId, 'Hist Offspring');
      const completed = await prisma.breeding.create({
        data: {
          userId,
          parent1Id: comp1.id,
          parent2Id: comp2.id,
          status: 'completed',
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          completesAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          seed: 77,
        },
      });
      await prisma.breedingResult.create({
        data: {
          breedingId: completed.id,
          offspringId: compOffspring.id,
          inheritedGenes: { fromParent1: ['element'], fromParent2: ['patternId'] },
          mutations: [],
        },
      });

      const res = await api().get('/v1/breeding/history').set(a).expect(200);
      const list = res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(2);

      const byId = (id: string) => list.find((x: any) => x.id === id);
      const inProg = byId(started.body.id);
      expect(inProg).toBeDefined();
      expect(inProg.status).toBe('in_progress');
      expect(inProg.result).toBeNull();
      expect(inProg.parent1).toMatchObject({ id: pet1Id });
      expect(inProg.parent2).toMatchObject({ id: pet2Id });

      const done = byId(completed.id);
      expect(done).toBeDefined();
      expect(done.status).toBe('completed');
      // `result` está mapeado a { offspringId, mutations } (breeding.service.ts:111-113).
      expect(done.result).toMatchObject({
        offspringId: compOffspring.id,
        mutations: [],
      });

      await api().get('/v1/breeding/history').expect(401);
    });
  });
});
