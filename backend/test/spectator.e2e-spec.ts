import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpectatorService } from '../src/modules/spectator/spectator.service';
import { BattleLogEntry } from '../src/modules/spectator/highlight.service';

/**
 * Espectador de combate (e2e) — camino feliz.
 *
 * Rutas cubiertas (spectator.controller.ts):
 *   - GET  /v1/spectator/live
 *   - GET  /v1/spectator/highlights
 *   - POST /v1/spectator/subscribe
 *
 * ────────────────────────────────────────────────────────────────────────────────────
 * PROTOTIPO — superficie implementada vs. pendiente:
 *
 *  Implementado sobre HTTP (camino feliz cubierto por este spec):
 *   - `subscribe`: crea/devuelve la suscripción del usuario a una pelea; es idempotente
 *     si el usuario ya está suscrito (devuelve la misma suscripción, sin duplicarla).
 *   - `live`: devuelve el estado en vivo de una pelea con el retraso de 10s aplicado
 *     (`visibleRound` queda por detrás de `currentRound` cuando la ronda acaba de añadirse).
 *   - `highlights`: devuelve la lista de highlights analizables (vacía cuando ninguna
 *     ronda cumple condiciones; no vacía cuando hay una pelea con un crítico).
 *
 *  Prototipo / pendiente (no se prueba por HTTP porque no hay entrada HTTP):
 *   - El estado vive en memoria (`Map` en spectator.service.ts; "production: Redis").
 *   - `addRound` está pensado para ser llamado por BattlesModule pero NUNCA se invoca en
 *     producción, así que para poblar `live`/`highlights` este spec lo hace a nivel de
 *     servicio (igual que seasons.e2e-spec.ts prueba `addXp`/`settleSeason`).
 *   - `highlights` no lee de Prisma (comentario "In production: query Prisma Highlight
 *     table"); analiza los buffers en memoria.
 *   - No hay endpoint de `unsubscribe` (solo existe el método de servicio).
 * ────────────────────────────────────────────────────────────────────────────────────
 */
describe('Espectador de combate (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let spectatorService: SpectatorService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `spectator_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
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

  /** ID de pelea único por prueba: los buffers/subs son en memoria y no se limpian. */
  const battleId = (tag: string) =>
    `spectator_test_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    spectatorService = app.get(SpectatorService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('POST /spectator/subscribe', () => {
    it('suscribe al usuario a la pelea y devuelve la suscripción activa', async () => {
      const { token, userId } = await signup();
      const battle = battleId('sub');

      const res = await api()
        .post('/v1/spectator/subscribe')
        .set(auth(token))
        .send({ battleId: battle })
        .expect(200);

      expect(res.body.battleId).toBe(battle);
      expect(res.body.userId).toBe(userId);
      expect(typeof res.body.joinedAt).toBe('number');
      expect(res.body.lastRoundSeen).toBe(0);
      expect(res.body.isActive).toBe(true);
    });

    it('el segundo subscribe del mismo usuario es idempotente (no duplica)', async () => {
      const { token, userId } = await signup();
      const battle = battleId('sub_idem');

      const first = await api()
        .post('/v1/spectator/subscribe')
        .set(auth(token))
        .send({ battleId: battle })
        .expect(200);
      const second = await api()
        .post('/v1/spectator/subscribe')
        .set(auth(token))
        .send({ battleId: battle })
        .expect(200);

      // Mismo objeto: mismo instante de unión y sigue activa.
      expect(second.body.userId).toBe(userId);
      expect(second.body.isActive).toBe(true);
      expect(second.body.joinedAt).toBe(first.body.joinedAt);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api()
        .post('/v1/spectator/subscribe')
        .send({ battleId: battleId('noauth') })
        .expect(401);
    });
  });

  describe('GET /spectator/live', () => {
    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/spectator/live').query({ battleId: battleId('noauth') }).expect(401);
    });

    it('devuelve 400 cuando falta battleId', async () => {
      const { token } = await signup();
      await api().get('/v1/spectator/live').set(auth(token)).expect(400);
    });

    it('devuelve 200 con cuerpo vacío cuando la pelea aún no tiene rondas', async () => {
      const { token } = await signup();
      const battle = battleId('live_empty');

      const res = await api()
        .get('/v1/spectator/live')
        .query({ battleId: battle })
        .set(auth(token))
        .expect(200);

      // El servicio devuelve `null` (pelea sin buffer) → cuerpo JSON vacío.
      expect(res.body).toEqual({});
    });

    it('devuelve 200 con el estado en vivo y el retraso de 10s aplicado', async () => {
      const { token } = await signup();
      const battle = battleId('live_state');

      // Un espectador se suscribe y se añade una ronda (no hay entrada HTTP → vía servicio).
      await api()
        .post('/v1/spectator/subscribe')
        .set(auth(token))
        .send({ battleId: battle })
        .expect(200);
      const entry: BattleLogEntry = {
        round: 1,
        attackerDamage: 30,
        defenderDamage: 20,
        isCritical: false,
        attackerHp: 80,
        defenderHp: 70,
      };
      spectatorService.addRound(battle, 1, entry);

      const res = await api()
        .get('/v1/spectator/live')
        .query({ battleId: battle })
        .set(auth(token))
        .expect(200);

      const body = res.body;
      expect(body.battleId).toBe(battle);
      expect(body.currentRound).toBe(1);
      // Retraso de 10s: la ronda recién añadida (timestamp = ahora) aún no es visible.
      expect(body.visibleRound).toBe(0);
      expect(body.attacker).toMatchObject({ petName: 'Attacker', hp: 80, maxHp: 100 });
      expect(body.defender).toMatchObject({ petName: 'Defender', hp: 70, maxHp: 100 });
      expect(body.isFinished).toBe(false);
      expect(body.spectators).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /spectator/highlights', () => {
    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/spectator/highlights').expect(401);
    });

    it('devuelve 200 con la lista (vacía cuando no hay rondas que cumplan condiciones)', async () => {
      const { token } = await signup();

      const res = await api()
        .get('/v1/spectator/highlights')
        .query({ limit: 10 })
        .set(auth(token))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Las únicas rondas añadidas hasta aquí (live_state) no cumplen ninguna condición.
      expect(res.body.length).toBe(0);
    });

    it('devuelve 200 con el highlight analizado (pelea con un crítico)', async () => {
      const { token } = await signup();
      const battle = battleId('highlight');

      // Ronda con crítico >50% de daño → califica como highlight de tipo 'critical'.
      const entry: BattleLogEntry = {
        round: 1,
        attackerDamage: 60,
        defenderDamage: 10,
        isCritical: true,
        attackerHp: 40,
        defenderHp: 40,
      };
      spectatorService.addRound(battle, 1, entry);

      const res = await api()
        .get('/v1/spectator/highlights')
        .query({ limit: 10 })
        .set(auth(token))
        .expect(200);

      const found = res.body.find((h: { battleId: string }) => h.battleId === battle);
      expect(found).toBeDefined();
      expect(found).toMatchObject({
        battleId: battle,
        type: 'critical',
        criticalCount: 1,
        totalRounds: 1,
        hasComeback: false,
      });
      expect(found.rating).toBeGreaterThan(0);
    });
  });
});

