import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Rituales de cuidado (e2e) — camino feliz.
 *
 * Rutas cubiertas (rituals.controller.ts, prefijo global `/v1`):
 *   - GET  /v1/rituals            → lista todos los rituales del usuario con su progreso
 *   - GET  /v1/rituals/active     → lista solo los rituales activos
 *   - POST /v1/rituals/create     → crea un ritual activo (201) + su progreso (1:1)
 *   - POST /v1/rituals/:id/check  → registra la completación de hoy (racha + gift)
 *
 * PRECONDICIONES REALES leídas de rituals.service.ts (sin adivinar):
 *   · `create` exige `petId` y `type` (uno de feed|battle|minigame|chat|clean) y que el
 *     pet sea PROPIO del usuario (`pets.getPetById` → 404 si no). Solo hay 1 huevo starter
 *     por registro, así que el pet se siembra directamente en Prisma (species/pattern
 *     reales de BD → FK válidas), patrón idéntico al de buddies.e2e-spec.ts.
 *   · `check` avanza por "slot" de completación. Con cadencia `daily`, cada día distinto
 *     suma +1 de racha. Al alcanzar `streak >= 7` (COMPLETION_DAYS) otorga el gift de
 *     GIFT_CONFIG[type], acrecenta `User.coins`/`User.accountXp` y reinicia `streak` a 0.
 *   · El gift de `feed` es { coins: 50, xp: 20, item: 'food_rare' }. Al completar 7 días
 *     seguidos, `totalCompletions` previa es 6 (>= 5) → aplica el factor 0.5 anti-inflación
 *     → coins = floor(50 * 0.5) = 25, xp = 20.
 *   · Se usa el parámetro `completionAt` de `check` para simular 7 días consecutivos de
 *     forma determinista (24 h exactos entre ellos → `now - 24h == lastCompletedAt`, por lo
 *     que `detectMiss` nunca dispara y la racha avanza limpiamente hasta el gift).
 */
describe('Rituales de cuidado (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  // Valores reales de rituals.service.ts → GIFT_CONFIG / constantes.
  const TYPE = 'feed';
  const GIFT = { coins: 25, xp: 20, item: 'food_rare' }; // 7 días → factor 0.5 anti-inflación
  const COMPLETION_DAYS = 7;
  const HOUR = 9;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `ritual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
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

  /** Crea un ritual activo vía HTTP (camino feliz) y devuelve su id. */
  async function createRitual(token: string, petId: string): Promise<string> {
    const res = await api()
      .post('/v1/rituals/create')
      .set(auth(token))
      .send({ petId, type: TYPE, hour: HOUR })
      .expect(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Ritual/RitualProgress no tienen FK hacia User/Pet (columnas indexadas sin relación),
    // así que se limpian explícitamente antes de borrar el usuario (el pet cascada vía FK).
    for (const id of createdUsers) {
      await prisma.ritualProgress.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.ritual.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // GET /v1/rituals — lista
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/rituals', () => {
    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/rituals').expect(401);
    });

    it('devuelve 200 con la lista vacía para un usuario nuevo', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/rituals').set(auth(token)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // POST /v1/rituals/create — creación
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('POST /v1/rituals/create', () => {
    it('exige autenticación (401 sin token)', async () => {
      await api()
        .post('/v1/rituals/create')
        .send({ petId: 'x', type: TYPE, hour: HOUR })
        .expect(401);
    });

    it('crea un ritual activo y su progreso (201) y lo persiste en BD', async () => {
      const { token, userId } = await signup();
      const pet = await seedPet(userId, 'Ritual Pet');

      const res = await api()
        .post('/v1/rituals/create')
        .set(auth(token))
        .send({ petId: pet.id, type: TYPE, hour: HOUR })
        .expect(201);
      const body = res.body;

      // Forma real (withProgress): racha 0/7, aún sin gift.
      expect(body.petId).toBe(pet.id);
      expect(body.type).toBe(TYPE);
      expect(body.cadence).toBe('daily');
      expect(body.hour).toBe(HOUR);
      expect(body.status).toBe('active');
      expect(body.streak).toBe(0);
      expect(body.goal).toBe(COMPLETION_DAYS);
      expect(body.progress).toBe('0/7');
      expect(body.totalCompletions).toBe(0);
      expect(body.lastCompletedAt).toBeNull();
      expect(body.gift).toBeFalsy();

      // Persistido en BD: ritual activo + su progreso (1:1 por ritualId).
      const ritual = await prisma.ritual.findUnique({ where: { id: body.id } });
      expect(ritual).toMatchObject({ userId, petId: pet.id, type: TYPE, status: 'active' });
      const progress = await prisma.ritualProgress.findUnique({ where: { ritualId: body.id } });
      expect(progress).toMatchObject({ userId, petId: pet.id, streak: 0, totalCompletions: 0 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // GET /v1/rituals/active — solo activos
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/rituals/active', () => {
    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/rituals/active').expect(401);
    });

    it('devuelve 200 con el ritual recién creado (activo)', async () => {
      const { token, userId } = await signup();
      const pet = await seedPet(userId, 'Active Pet');
      const id = await createRitual(token, pet.id);

      const res = await api().get('/v1/rituals/active').set(auth(token)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(id);
      expect(res.body[0].status).toBe('active');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────
  // POST /v1/rituals/:id/check — completación + recompensa (HAPPY PATH central)
  // ─────────────────────────────────────────────────────────────────────────────────
  describe('POST /v1/rituals/:id/check', () => {
    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/rituals/nope/check').send({}).expect(401);
    });

    it('registra la primera completación: racha 1, sin gift, y persiste el estado', async () => {
      const { token, userId } = await signup();
      const pet = await seedPet(userId, 'First Pet');
      const id = await createRitual(token, pet.id);

      const day1 = new Date(Date.UTC(2024, 0, 1, 12, 0, 0)).toISOString();
      const res = await api()
        .post(`/v1/rituals/${id}/check`)
        .set(auth(token))
        .send({ completionAt: day1 })
        .expect(200);

      expect(res.body.streak).toBe(1);
      expect(res.body.totalCompletions).toBe(1);
      expect(res.body.progress).toBe('1/7');
      expect(res.body.gift).toBeNull();
      expect(new Date(res.body.lastCompletedAt).getTime()).toBe(new Date(day1).getTime());

      // Registro persistido en BD.
      const progress = await prisma.ritualProgress.findUnique({ where: { ritualId: id } });
      expect(progress).toMatchObject({ streak: 1, totalCompletions: 1, missCount: 0 });
    });

    it('HAPPY PATH: 7 días consecutivos otorgan el gift y acrecentan monedas/XP', async () => {
      const { token, userId } = await signup();
      const pet = await seedPet(userId, 'Streak Pet');
      const id = await createRitual(token, pet.id);

      const before = await prisma.user.findUnique({ where: { id: userId } });

      // 7 días consecutivos (24 h exactos → sin "miss"). Solo el 7º otorga el gift.
      const base = Date.UTC(2024, 0, 1, 12, 0, 0);
      let last: any;
      for (let i = 0; i < COMPLETION_DAYS; i++) {
        last = await api()
          .post(`/v1/rituals/${id}/check`)
          .set(auth(token))
          .send({ completionAt: new Date(base + i * 86_400_000).toISOString() })
          .expect(200);
        if (i < COMPLETION_DAYS - 1) {
          // Días 1-6: aún no se alcanza el objetivo → sin gift, racha +1 por día.
          expect(last.body.gift).toBeNull();
          expect(last.body.streak).toBe(i + 1);
        }
      }

      // El 7º check otorga el gift de `feed` (con factor 0.5 anti-inflación,
      // totalCompletions previa = 6 >= 5) y reinicia la racha a 0.
      expect(last.body.gift).toEqual(GIFT);
      expect(last.body.streak).toBe(0);
      expect(last.body.totalCompletions).toBe(COMPLETION_DAYS);
      expect(last.body.progress).toBe('0/7');
      expect(last.body.status).toBe('active');

      // Recompensa acreditada en la cuenta del usuario.
      const after = await prisma.user.findUnique({ where: { id: userId } });
      expect(after!.coins - before!.coins).toBe(GIFT.coins);
      expect(after!.accountXp - before!.accountXp).toBe(GIFT.xp);

      // Registro final en BD: racha reiniciada, 7 completaciones, última el día 7.
      const progress = await prisma.ritualProgress.findUnique({ where: { ritualId: id } });
      expect(progress).toMatchObject({
        streak: 0,
        totalCompletions: COMPLETION_DAYS,
        missCount: 0,
      });
      expect(new Date(progress!.lastCompletedAt!).getTime()).toBe(new Date(base + 6 * 86_400_000).getTime());
    });

    it('no duplica una completación del mismo día (slot idempotente)', async () => {
      const { token, userId } = await signup();
      const pet = await seedPet(userId, 'Same Day Pet');
      const id = await createRitual(token, pet.id);

      const sameDay = new Date(Date.UTC(2024, 0, 1, 12, 0, 0)).toISOString();
      await api()
        .post(`/v1/rituals/${id}/check`)
        .set(auth(token))
        .send({ completionAt: sameDay })
        .expect(200);

      // Mismo día → no avanza: repite el estado sin sumar completación ni racha.
      const res = await api()
        .post(`/v1/rituals/${id}/check`)
        .set(auth(token))
        .send({ completionAt: sameDay })
        .expect(200);
      expect(res.body.streak).toBe(1);
      expect(res.body.totalCompletions).toBe(1);
      // El camino de slot duplicado devuelve `withProgress(ritual, progress)` sin `gift`
      // (clave omitida → undefined), a diferencia del camino normal (gift: null).
      expect(res.body.gift).toBeFalsy();

      const progress = await prisma.ritualProgress.findUnique({ where: { ritualId: id } });
      expect(progress!.totalCompletions).toBe(1);
    });
  });
});