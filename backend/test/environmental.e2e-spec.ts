import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * Environmental Awareness (e2e). Cubre US1 (T016): `GET /environmental/status` con weather mock
 * (upstream, cache, API down) y degradación; y US2 (T021): heartbeat → inactividad → `solo` →
 * retorno `active`. El clima se mockea con `global.fetch` (Open-Meteo no existe en el entorno de test).
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

  function weatherResponse(temp: number, code: number): Response {
    return new Response(JSON.stringify({ current: { temperature_2m: temp, weather_code: code, is_day: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
    it('sin coordenadas → weather unknown, pero devolve timeOfDay/activity/festival (degradación)', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
      expect(res.body.timeOfDay).toMatch(/^(late_night|morning|afternoon|evening|night)$/);
      expect(res.body.weather).toEqual({
        condition: 'unknown',
        temperature: null,
        weatherCode: null,
        cached: false,
        fetchedAt: null,
      });
      expect(res.body.activity).toHaveProperty('mode');
      expect(res.body).toHaveProperty('festival');
    });

    it('con coordenadas + upstream OK → condition correcta, 2ª llamada servida de cache (sin upstream)', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ latitude: 19.4, longitude: -99.13 }).expect(200);
      await redis.run((r) => r.del(redis.key('weather:19.4:-99.13'))); // limpiar cache previa

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(weatherResponse(32, 0));
      try {
        const res1 = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
        expect(res1.body.weather.condition).toBe('hot'); // 32 >= hot_temp (30)
        expect(res1.body.weather.temperature).toBe(32);
        expect(res1.body.weather.cached).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const res2 = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
        expect(res2.body.weather.cached).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1); // segunda llamada NO consulta el upstream
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('API de meteo cae → degrada a unknown y NUNCA devuelve 5xx', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ latitude: 40.4, longitude: -3.7 }).expect(200);
      await redis.run((r) => r.del(redis.key('weather:40.4:-3.7')));

      const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
      try {
        const res = await api().get('/v1/environmental/status').set(auth(token)).expect(200);
        expect(res.body.weather.condition).toBe('unknown');
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
