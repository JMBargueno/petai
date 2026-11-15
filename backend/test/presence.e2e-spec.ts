import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Presence + Co-op (e2e) — camino feliz.
 *
 * Rutas cubiertas (presence.controller.ts, prefijo global `v1`):
 *   - GET  /v1/presence/:userId  → presencia de dispositivos (privada, S-15)
 *   - GET  /v1/coop/history      → historial de visitas
 *   - POST /v1/coop/visit        → acción de visita co-op (requiere amistad aceptada)
 *
 * La presencia y la co-op se mantienen en memoria (no hay heartbeats desde el cliente en
 * e2e → lista de dispositivos vacía; el historial de visitas devuelve []). S-15: la
 * presencia es privada; solo el propio usuario o un amigo aceptado la pueden consultar.
 */
describe('Presence + Co-op (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `presence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
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
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('GET /presence/:userId', () => {
    it('devuelve 200 para el propio usuario (dispositivos vacíos sin heartbeats)', async () => {
      const { token, userId } = await signup();
      const res = await api().get(`/v1/presence/${userId}`).set(auth(token)).expect(200);
      expect(res.body.userId).toBe(userId);
      expect(Array.isArray(res.body.devices)).toBe(true);
      expect(res.body.devices).toHaveLength(0);
      expect(res.body.hasActiveDevices).toBe(false);
    });

    it('la presencia es privada (S-15): 403 para un tercero sin amistad', async () => {
      const owner = await signup();
      const stranger = await signup();
      await api().get(`/v1/presence/${owner.userId}`).set(auth(stranger.token)).expect(403);
    });

    it('exige autenticación (401 sin token)', async () => {
      const { userId } = await signup();
      await api().get(`/v1/presence/${userId}`).expect(401);
    });
  });

  describe('GET /coop/history', () => {
    it('devuelve 200 con el historial de visitas (vacío sin visitas)', async () => {
      const { token, userId } = await signup();
      const res = await api().get('/v1/coop/history').set(auth(token)).expect(200);
      expect(res.body.userId).toBe(userId);
      expect(Array.isArray(res.body.visits)).toBe(true);
      expect(res.body.visits).toHaveLength(0);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/coop/history').expect(401);
    });
  });

  describe('POST /coop/visit', () => {
    it('rechaza la visita sin amistad aceptada (403)', async () => {
      const owner = await signup();
      const visitor = await signup();
      await api()
        .post('/v1/coop/visit')
        .set(auth(visitor.token))
        .send({ ownerId: owner.userId, petId: 'pet_x', action: 'feed' })
        .expect(403);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/coop/visit').send({ ownerId: 'x', petId: 'p', action: 'play' }).expect(401);
    });
  });
});
