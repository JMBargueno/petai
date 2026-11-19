import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * Environmental Awareness (e2e). Cubre US1 (T016): `GET /environmental/status` (el clima es siempre
 * `unknown`: la ubicación se queda en el dispositivo y cada app pide el clima por su cuenta); y US2
 * (T021): heartbeat → inactividad → `solo` → retorno `active`.
 */
describe('Environmental Awareness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
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

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('GET /environmental/status (US1)', () => {
    it('weather siempre unknown, pero devuelve timeOfDay/activity/festival (degradación)', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
      expect(res.body.timeOfDay).toMatch(/^(late_night|morning|afternoon|evening|night)$/);
      expect(res.body.weather).toEqual({
        condition: 'unknown',
        temperature: null,
        weatherCode: null,
        cached: false,
        fetchedAt: null,
        sunrise: null,
        sunset: null,
      });
      expect(res.body.activity).toHaveProperty('mode');
      expect(res.body).toHaveProperty('festival');
    });

    it('las coordenadas que aún mandan los escritorios antiguos se ignoran y no se consulta el clima', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ latitude: 19.4, longitude: -99.13 }).expect(200);
      const fetchSpy = jest.spyOn(global, 'fetch');
      try {
        const res = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
        expect(res.body.weather.condition).toBe('unknown');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('POST /environmental/activity + inactividad (US2)', () => {
    it('heartbeat → activity.mode "active"', async () => {
      const { token } = await signup();
      await api()
        .post('/v1/environmental/activity')
        .set(auth(token))
        .send({ active: true, cpuUsage: 40 })
        .expect(200)
        .expect((body) => expect(body.ok).toBe(true));

      const res = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
      expect(res.body.activity.mode).toBe('active');
      expect(res.body.activity.active).toBe(true);
    });

    it('tras omitir heartbeats > umbral → mode "solo"', async () => {
      const { token, userId } = await signup();
      await api().post('/v1/environmental/activity').set(auth(token)).send({ active: true }).expect(200);
      // Simula inactividad: mueve el último heartbeat 3 h atrás
      const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
      await redis.run((r) =>
        r.set(redis.key(`activity:${userId}`), JSON.stringify({ lastActiveAt: threeHoursAgo, active: false }), 'EX', 3 * 3600),
      );
      const res = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
      expect(res.body.activity.mode).toBe('solo');
      expect(res.body.activity.active).toBe(false);
    });

    it('body malformado (cpuUsage < 0) → 400', async () => {
      const { token } = await signup();
      await api().post('/v1/environmental/activity').set(auth(token)).send({ cpuUsage: -5 }).expect(400);
    });

    it('sin token → 401 en los 3 endpoints', async () => {
      await api().get('/v1/environmental/status').expect(401);
      await api().post('/v1/environmental/activity').send({}).expect(401);
      await api().get('/v1/environmental/festivals/upcoming').expect(401);
    });
  });

  describe('GET /environmental/festivals/upcoming (US3)', () => {
    it('lista próximas con daysRemaining ≥ 0', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/environmental/festivals/upcoming').set(auth(token)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const f of res.body) {
        expect(f.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(f).toHaveProperty('id');
        expect(f).toHaveProperty('name');
        expect(f).toHaveProperty('date');
      }
    });
  });
});
