import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Pet Buddies / Cuidado cooperativo (e2e) — camino feliz.
 *
 * Rutas cubiertas (buddies.controller.ts, prefijo global `/v1`):
 *   - POST /v1/buddies/pair          → crea (o recupera) el par buddy entre dos pets
 *                                      propios del usuario (201, upsert `buddyPair`).
 *   - POST /v1/buddies/trigger       → rola y aplica una interacción espontánea entre
 *                                      los buddies (200; null si no procede).
 *   - GET  /v1/buddies/interactions  → historial de interacciones buddy del usuario.
 *   - GET  /v1/buddies/:petId        → estado buddy de un pet (par asociado, separado,
 *                                      buddy activo y nº de interacciones del día).
 *
 * PRECONDICIONES REALES leídas de buddies.service.ts (sin adivinar):
 *   · `pair` exige dos pets DISTINTOS y PROPIOS del usuario (`getPetById` los valida).
 *   · `trigger` exige al menos un `buddyPair` con `separated=false`, ambos pets
 *     despiertos y sanos, y sin exceder el cooldown (máx 3 en 5 min). El tipo se rola
 *     con un azar sembrado por pareja e intento; si el roll cae fuera del 65% de probabilidad acumulada, la
 *     interacción no ocurre y se devuelve `null`. Por eso el happy path de `trigger`
 *     se obtiene repitiendo la llamada (cada `null` no crea registro ni gasta cooldown)
 *     hasta conseguir un resultado no nulo, y se corta en cuanto ocurre uno.
 *   · Solo hay 1 huevo starter por registro, así que el segundo pet se siembra
 *     directamente en Prisma (species/pattern reales de BD → FK válidas), patrón
 *     idéntico al de breeding.e2e-spec.ts.
 */
describe('Pet Buddies: par, interacción y estado (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const VALID_TYPES = ['chase', 'sleep_together', 'play_fight', 'eat_together', 'idle_chat', 'watch_together'];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** register → /v1/me (userId) → eclosionar huevo (pet A) → sembrar pet B en BD. */
  async function makeUser(): Promise<{ token: string; userId: string; petAId: string; petBId: string; auth: Record<string, string> }> {
    const email = `buddy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Buddies Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);

    // Pet A: eclosionar el huevo starter de bienvenida.
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    const petAId = (
      await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)
    ).body.id as string;

    // Pet B: sembrado directamente (necesario porque solo hay 1 huevo por registro).
    const petB = await seedPet(userId, 'Buddy B');

    return { token, userId, petAId, petBId: petB.id, auth: a };
  }

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

  // ─────────────────────────────────────────────────────────────────────────────────
  // POST /v1/buddies/pair — enlace buddy
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('POST /v1/buddies/pair', () => {
    it('a) crea el par buddy entre dos pets propios → 201 con el par persistido y no separado', async () => {
      const { userId, petAId, petBId, auth: a } = await makeUser();

      const res = await api()
        .post('/v1/buddies/pair')
        .set(a)
        .send({ petAId, petBId })
        .expect(201);
      const pair = res.body;

      // El par se normaliza ordenando los ids: petAId <= petBId en BD.
      expect(pair.userId).toBe(userId);
      expect(pair.separated).toBe(false);
      const norm = [petAId, petBId].sort();
      expect(pair.petAId).toBe(norm[0]);
      expect(pair.petBId).toBe(norm[1]);

      // La fila quedó persistida y el upsert es idempotente (misma fila al repetirlo).
      const row = await prisma.buddyPair.findFirst({
        where: { userId },
      });
      expect(row).not.toBeNull();
      expect(row!.separated).toBe(false);

      const again = await api()
        .post('/v1/buddies/pair')
        .set(a)
        .send({ petAId, petBId })
        .expect(201);
      expect(again.body.id).toBe(row!.id);
      const count = await prisma.buddyPair.count({ where: { userId } });
      expect(count).toBe(1);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/buddies/pair').send({}).expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // POST /v1/buddies/trigger — interacción cooperativa (efecto + registro)
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('POST /v1/buddies/trigger', () => {
    it('b) sin par buddy devuelve 200 y null (no procede)', async () => {
      const { token } = await makeUser();
      const res = await api().post('/v1/buddies/trigger').set(auth(token)).send({}).expect(201);
      // El servicio devuelve `null` cuando no procede; por HTTP se serializa como cuerpo vacío.
      expect(res.body).toEqual({});
      expect(res.body.id).toBeUndefined();
    });

    it('c) con par buddy rola una interacción, aplica el efecto a ambos pets y persiste el registro', async () => {
      const { userId, petAId, petBId, token } = await makeUser();
      // Establece el enlace buddy.
      await api()
        .post('/v1/buddies/pair')
        .set(auth(token))
        .send({ petAId, petBId })
        .expect(201);

      const petBefore = await Promise.all(
        [petAId, petBId].map((id) => prisma.pet.findUnique({ where: { id } })),
      );
      const happinessBefore: Record<string, number> = { [petAId]: petBefore[0]!.happiness, [petBId]: petBefore[1]!.happiness };
      const energyBefore: Record<string, number> = { [petAId]: petBefore[0]!.energy, [petBId]: petBefore[1]!.energy };

      // El roll cambia en cada intento: cada `null` no crea registro ni gasta cooldown, así que
      // se repite hasta obtener una interacción real (o agotar intentos de seguridad).
      let record: any = null;
      for (let i = 0; i < 15 && !record; i++) {
        const r = await api().post('/v1/buddies/trigger').set(auth(token)).send({}).expect(201);
        if (r.body && r.body.id) record = r.body; // `null` → cuerpo vacío (sin `id`)
      }
      expect(record).not.toBeNull();

      // Shape del resultado (buddies.service.ts:131).
      expect(record.id).toEqual(expect.any(String));
      expect(record.userId).toBe(userId);
      const norm = [petAId, petBId].sort();
      expect(record.petAId).toBe(norm[0]);
      expect(record.petBId).toBe(norm[1]);
      expect(VALID_TYPES).toContain(record.type);
      expect(record.duration).toBeGreaterThan(0);
      expect(record.effects).toBeTruthy();

      // El registro quedó persistido en BD con los mismos datos que la respuesta.
      const row = await prisma.buddyInteraction.findUnique({ where: { id: record.id } });
      expect(row).not.toBeNull();
      expect(row!.userId).toBe(userId);
      expect(row!.type).toBe(record.type);
      expect(row!.duration).toBe(record.duration);
      expect(row!.effects).toBeTruthy();

      // El efecto se aplicó a AMBOS pets (sin decay: pets recién creados, < 36 s de tick).
      const petAfter = await Promise.all(
        [petAId, petBId].map((id) => prisma.pet.findUnique({ where: { id } })),
      );
      for (const id of [petAId, petBId]) {
        const after = petAfter[[petAId, petBId].indexOf(id)]!;
        if (record.effects.happiness) {
          expect(after.happiness).toBeGreaterThanOrEqual(happinessBefore[id]);
        }
        if (record.effects.energy) {
          expect(after.energy).toBeGreaterThanOrEqual(energyBefore[id]);
        }
      }
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/buddies/trigger').send({}).expect(401);
    });
  });
  // ─────────────────────────────────────────────────────────────────────────────────
  // GET /v1/buddies/:petId — estado buddy de un pet
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/buddies/:petId', () => {
    it('d) con par activo devuelve buddyActive=true y el buddy asociado', async () => {
      const { petAId, petBId, token } = await makeUser();
      await api()
        .post('/v1/buddies/pair')
        .set(auth(token))
        .send({ petAId, petBId })
        .expect(201);

      const res = await api().get(`/v1/buddies/${petAId}`).set(auth(token)).expect(200);
      const body = res.body;

      expect(body.petId).toBe(petAId);
      expect(body.buddyActive).toBe(true);
      expect(body.separated).toBe(false);
      expect(body.buddyPetId).toBe(petBId);
      expect(typeof body.todayBuddyInteractions).toBe('number');
      expect(body.pair).toMatchObject({ userId: expect.any(String) });
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/buddies/somepet').expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // GET /v1/buddies/interactions — historial
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/buddies/interactions', () => {
    it('e) devuelve el historial (array) y contiene la interacción ya generada', async () => {
      const { userId, petAId, petBId, token } = await makeUser();
      await api()
        .post('/v1/buddies/pair')
        .set(auth(token))
        .send({ petAId, petBId })
        .expect(201);

      // Genera una interacción real (repite hasta obtener un resultado no nulo).
      let record: any = null;
      for (let i = 0; i < 15 && !record; i++) {
        const r = await api().post('/v1/buddies/trigger').set(auth(token)).send({}).expect(201);
        if (r.body && r.body.id) record = r.body; // `null` → cuerpo vacío (sin `id`)
      }
      expect(record).not.toBeNull();

      const res = await api().get('/v1/buddies/interactions?limit=50').set(auth(token)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId,
            id: record.id,
            type: record.type,
            duration: record.duration,
          }),
        ]),
      );
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/buddies/interactions').expect(401);
    });
  });
});
