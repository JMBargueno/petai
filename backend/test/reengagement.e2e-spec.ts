import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Reengagement / "Welcome Back" (e2e) — camino feliz.
 *
 * Rutas cubiertas (reengagement.controller.ts, prefijo global `/v1`):
 *   - GET  /v1/reengagement/status  → estado de la secuencia (tramo, plan, buff) del pet
 *                                     activo. Refresca `lastLoginAt` (el jugador está presente).
 *   - GET  /v1/reengagement/diary   → diario de ausencia (3-5 viñetas con datos reales).
 *   - POST /v1/reengagement/forgive → completa el ritual de perdón del tramo → recovery buff
 *                                     24h; en el tramo `emotional` otorga además un regalo
 *                                     (item + 200 monedas).
 *
 * PRECONDICIONES REALES leídas de reengagement.service.ts (sin adivinar):
 *   · Todas las rutas exigen un pet propio (`getActivePet` → 404 si no hay). Un usuario
 *     recién registrado solo tiene un huevo (no un pet), así que se siembra un pet
 *     directamente en Prisma (species/pattern reales de BD → FK válidas), patrón idéntico
 *     al de breeding.e2e-spec.ts / buddies.e2e-spec.ts.
 *   · `forgive` exige ausencia ≥ 24h (`MIN_ACTIVE_MS`) y ritual completado según tramo
 *     (`validateRitual`); para `emotional` no exige ninguna acción. Se siembra un pet con
 *     `lastLoginAt` en el pasado (≥ 30 días) para forzar el tramo `emotional` y así cubrir
 *     el happy path de concesión de regalo (item + 200 monedas) y de creación del registro
 *     de reconciliación (recoveryBuffUntil / welcomeBackTier / lastWelcomeBackAt).
 */
describe('Reengagement / Welcome Back (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createdUsers: string[] = [];

  const H = 3_600_000;
  const RECOVERY_BUFF_MS = 24 * H;
  const EMOTIONAL_COINS = 200;

  /** Siembra un pet propio del usuario con `lastLoginAt` opcional (para forzar el tramo). */
  async function seedPet(userId: string, nickname: string, lastLoginAt?: Date) {
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
        lastLoginAt,
      },
    });
  }

  /** register → /v1/me (userId) → sembrar un pet propio (con `lastLoginAt` opcional). */
  async function makeUser(lastLoginAt?: Date) {
    const email = `reengage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Reengagement Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);
    const pet = await seedPet(userId, 'Reengage Pet', lastLoginAt);
    return { token, userId, petId: pet.id, auth: a };
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

  describe('GET /reengagement/status', () => {
    it('devuelve 200 con tramo, plan y buff para un pet ausente (y refresca lastLoginAt)', async () => {
      // Pet ausente 10 días (tramo `sad`: ≥ 7 días y < 30 días → active).
      const { token, petId } = await makeUser(new Date(Date.now() - 10 * 24 * H));
      const res = await api().get('/v1/reengagement/status').set(auth(token)).expect(200);
      const body = res.body;

      expect(body.petId).toBe(petId);
      expect(body.active).toBe(true);
      expect(body.tier).toBe('sad');
      expect(typeof body.absenceMs).toBe('number');
      expect(body.absenceMs).toBeGreaterThanOrEqual(10 * 24 * H - 60_000);
      // Plan del tramo `sad`: acciones de cuidado requeridas, sin regalo.
      expect(body.plan).toMatchObject({ tier: 'sad', gift: false });
      expect(Array.isArray(body.plan.requiredActions)).toBe(true);
      // Buff no activo aún (no se ha completado el ritual).
      expect(body.recoveryBuff.active).toBe(false);
      // El jugador está presente → lastLoginAt se refresca a "ahora".
      const pet = await prisma.pet.findUnique({ where: { id: petId } });
      expect(pet!.lastLoginAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it('devuelve active=false y tier/plan null para un pet presente (ausencia < 24h)', async () => {
      const { token, petId } = await makeUser(new Date(Date.now() - 2 * H));
      const body = (await api().get('/v1/reengagement/status').set(auth(token)).expect(200)).body;
      expect(body.petId).toBe(petId);
      expect(body.active).toBe(false);
      expect(body.tier).toBeNull();
      expect(body.plan).toBeNull();
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/reengagement/status').expect(401);
    });
  });

  describe('GET /reengagement/diary', () => {
    it('devuelve 200 con el diario de ausencia (viñetas con categoría/texto/icono)', async () => {
      const { token, petId } = await makeUser(new Date(Date.now() - 5 * 24 * H));
      const res = await api().get('/v1/reengagement/diary').set(auth(token)).expect(200);
      const body = res.body;

      expect(body.petId).toBe(petId);
      expect(Array.isArray(body.entries)).toBe(true);
      expect(body.entries.length).toBeGreaterThanOrEqual(3);
      expect(body.entries.length).toBeLessThanOrEqual(5);
      for (const e of body.entries) {
        expect(typeof e.category).toBe('string');
        expect(typeof e.text).toBe('string');
        expect(typeof e.icon).toBe('string');
      }
      // El diario se persiste en el pet (snapshot) → la segunda lectura lo devuelve en caché.
      const pet = await prisma.pet.findUnique({ where: { id: petId } });
      expect(pet!.absenceDiary).not.toBeNull();
      const second = await api().get('/v1/reengagement/diary').set(auth(token)).expect(200);
      expect(second.body.cached).toBe(true);
      expect(second.body.entries.length).toBe(body.entries.length);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/reengagement/diary').expect(401);
    });
  });
  describe('POST /reengagement/forgive', () => {
    it('HAPPY PATH: tramo emotional → recovery buff 24h + regalo (item/monedas) y registro de reconciliación', async () => {
      // Pet ausente 35 días → tramo `emotional` (≥ 30 días). Sin acciones requeridas.
      const { token, userId, petId } = await makeUser(new Date(Date.now() - 35 * 24 * H));
      const userBefore = await prisma.user.findUnique({ where: { id: userId } });

      const res = await api()
        .post('/v1/reengagement/forgive')
        .set(auth(token))
        .send({})
        .expect(201);
      const body = res.body;

      // Mensaje + tramo emocional.
      expect(typeof body.message).toBe('string');
      expect(body.tier).toBe('emotional');
      // Recovery buff de 24h aplicado.
      expect(body.recoveryBuff.active).toBe(true);
      expect(body.recoveryBuff.durationMs).toBe(RECOVERY_BUFF_MS);
      expect(new Date(body.recoveryBuff.until).getTime()).toBeGreaterThan(Date.now());

      // Regalo emocional: 200 monedas (el item puede no existir → fallback; coinsGranted ≥ 200).
      expect(body.gift).not.toBeNull();
      expect(body.gift.coins).toBe(EMOTIONAL_COINS);
      expect(typeof body.gift.coinsGranted).toBe('number');
      expect(body.gift.coinsGranted).toBeGreaterThanOrEqual(EMOTIONAL_COINS);
      expect(body.gift.fallback === true || body.gift.fallback === false).toBe(true);

      // Efecto económico: las monedas del regalo se acreditan en el saldo del usuario.
      const userAfter = await prisma.user.findUnique({ where: { id: userId } });
      expect(userAfter!.coins - userBefore!.coins).toBe(EMOTIONAL_COINS);

      // Registro de reconciliación en el pet.
      const pet = await prisma.pet.findUnique({ where: { id: petId } });
      expect(pet!.welcomeBackTier).toBe('emotional');
      expect(pet!.lastWelcomeBackAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(pet!.recoveryBuffUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(pet!.sleeping).toBe(false);

      // Bonding incrementado y evento de reconciliación registrado.
      const bondingEvent = await prisma.bondingEvent.findFirst({
        where: { petId, reason: 'welcome_back' },
      });
      expect(bondingEvent).not.toBeNull();
      expect(bondingEvent!.delta).toBe(5);
    });

    it('HAPPY PATH: tramo sad → buff 24h y registro, sin regalo (acciones de cuidado completas)', async () => {
      // Pet ausente 10 días → tramo `sad` (requiere feed+clean+minigame).
      const { token, petId } = await makeUser(new Date(Date.now() - 10 * 24 * H));
      const res = await api()
        .post('/v1/reengagement/forgive')
        .set(auth(token))
        .send({ actions: ['feed', 'clean', 'minigame'] })
        .expect(201);
      const body = res.body;

      expect(body.tier).toBe('sad');
      expect(body.recoveryBuff.active).toBe(true);
      expect(body.recoveryBuff.durationMs).toBe(RECOVERY_BUFF_MS);
      // Sin regalo en tramos distintos del emocional.
      expect(body.gift).toBeNull();

      const pet = await prisma.pet.findUnique({ where: { id: petId } });
      expect(pet!.welcomeBackTier).toBe('sad');
      expect(pet!.recoveryBuffUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('HAPPY PATH: tramo offended → buff 24h con disculpa ("lo siento")', async () => {
      // Pet ausente 2.5 días → tramo `offended` (≥ 48h).
      const { token, petId } = await makeUser(new Date(Date.now() - 2.5 * 24 * H));
      const res = await api()
        .post('/v1/reengagement/forgive')
        .set(auth(token))
        .send({ chat: 'Perdón, lo siento mucho' })
        .expect(201);

      expect(res.body.tier).toBe('offended');
      expect(res.body.recoveryBuff.active).toBe(true);
      expect(res.body.gift).toBeNull();
      const pet = await prisma.pet.findUnique({ where: { id: petId } });
      expect(pet!.welcomeBackTier).toBe('offended');
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/reengagement/forgive').send({}).expect(401);
    });
  });
});


