import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';

/**
 * E2E de notificaciones con personalidad (feature 007).
 *
 * - Contrato REST: `GET /v1/me` (notificationPrefs) y `PATCH /v1/me` (merge parcial, validación).
 * - Lógica de decisión del dispatcher (con Prisma + Redis reales): tono de plantilla (sin IA),
 *   rate limit (4→3), dedup, toggle off y quiet hours.
 */
describe('Notificaciones con personalidad (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  async function signup() {
    const reg = await api()
      .post('/v1/auth/register')
      .send({
        email: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`,
        password: 'Password123!',
        displayName: 'Cuidador',
      })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const eggs = await api().get('/v1/eggs').set(auth).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201)).body.id as string;
    const me = await api().get('/v1/me').set(auth).expect(200);
    return { auth, petId, userId: me.body.id as string };
  }
  type U = Awaited<ReturnType<typeof signup>>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  describe('Contrato REST GET/PATCH /me (US2)', () => {
    it('GET /me devuelve notificationPrefs=null por defecto', async () => {
      const u = await signup();
      const me = await api().get('/v1/me').set(u.auth).expect(200);
      expect(me.body.notificationPrefs).toBeNull();
    });

    it('PATCH /me con maxPerDay=5 → GET devuelve prefs resueltas con maxPerDay=5', async () => {
      const u = await signup();
      const patched = await api()
        .patch('/v1/me')
        .set(u.auth)
        .send({ notificationPrefs: { maxPerDay: 5 } })
        .expect(200);
      expect(patched.body.notificationPrefs).toMatchObject({
        vitals_critical: true,
        interaction: true,
        achievement: true,
        arena: true,
        event: true,
        maxPerDay: 5,
      });

      const me = await api().get('/v1/me').set(u.auth).expect(200);
      expect(me.body.notificationPrefs).toMatchObject({ maxPerDay: 5, interaction: true });
    });

    it('PATCH /me merge parcial: solo cambia el campo enviado', async () => {
      const u = await signup();
      await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { maxPerDay: 7 } }).expect(200);
      const patched = await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { interaction: false } }).expect(200);
      expect(patched.body.notificationPrefs).toMatchObject({ interaction: false, maxPerDay: 7, vitals_critical: true });
    });

    it('toggle off verificado: vitals_critical=false se persiste', async () => {
      const u = await signup();
      const patched = await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { vitals_critical: false } }).expect(200);
      expect(patched.body.notificationPrefs.vitals_critical).toBe(false);
    });

    it('validación: maxPerDay fuera de rango (0 y 11) → 400', async () => {
      const u = await signup();
      await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { maxPerDay: 0 } }).expect(400);
      await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { maxPerDay: 11 } }).expect(400);
    });

    it('validación: categoría desconocida → 400', async () => {
      const u = await signup();
      await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { bogus_category: true } }).expect(400);
    });
  });

  describe('Lógica de decisión del dispatcher (US1/US2)', () => {
    const dayNoon = new Date('2026-06-15T12:00:00Z');

    /** Captura las emisiones WS `pet:notification` envueltando `RealtimeGateway.emitToUser`. */
    async function withCaptured(fn: (emissions: any[]) => Promise<void>) {
      const realtime = app.get(RealtimeGateway);
      const emissions: any[] = [];
      const orig = realtime.emitToUser.bind(realtime);
      realtime.emitToUser = (uid: string, ev: string, payload: unknown) => {
        if (ev === 'pet:notification') emissions.push({ uid, payload });
        return orig(uid, ev, payload);
      };
      try {
        await fn(emissions);
      } finally {
        realtime.emitToUser = orig;
      }
    }

    it('tono de plantilla (sin IA): evento vitals → WS pet:notification con frase del rasgo', async () => {
      const u = await signup();
      // Damos personalidad valiente + tier acquainted para verificar el tono concreto.
      await prisma.pet.update({
        where: { id: u.petId },
        data: { personality: { trait: 'valiente' } as any, bondingTier: 'acquainted' },
      });
      const dispatcher = app.get(NotificationDispatcherService);

      let captured: any = null;
      await withCaptured(async (emissions) => {
        const emitted = await dispatcher.dispatch(u.userId, u.petId, 'vitals_critical', { vitals: true }, dayNoon);
        expect(emitted).toBe(true);
        captured = emissions[0];
      });

      expect(captured).toBeDefined();
      expect(captured.uid).toBe(u.userId);
      expect(captured.payload).toMatchObject({
        petId: u.petId,
        type: 'vitals',
        category: 'vitals_critical',
        source: 'template',
      });
      const valienteOptions = ['¡Oye! ¿Me dejas solo otra vez? 🙄', '¡Estoy muriendo de hambre! 😤'];
      expect(valienteOptions).toContain(captured.payload.message);
    });

    it('rate limit: 4 categorías en un día → 3 emitidas (maxPerDay por defecto = 3)', async () => {
      const u = await signup();
      const dispatcher = app.get(NotificationDispatcherService);
      const categories = ['vitals_critical', 'interaction', 'achievement', 'arena'] as const;

      let emitted = 0;
      await withCaptured(async (emissions) => {
        for (const c of categories) {
          const r = await dispatcher.dispatch(u.userId, u.petId, c, {}, dayNoon);
          if (r) emitted++;
        }
        expect(emissions.length).toBe(3);
      });
      expect(emitted).toBe(3);
    });

    it('dedup: 5 eventos misma categoría en 4 min → 1 emitida', async () => {
      const u = await signup();
      const dispatcher = app.get(NotificationDispatcherService);

      let emitted = 0;
      await withCaptured(async (emissions) => {
        const base = dayNoon.getTime();
        for (let i = 0; i < 5; i++) {
          const r = await dispatcher.dispatch(u.userId, u.petId, 'achievement', {}, new Date(base + i * 40 * 1000));
          if (r) emitted++;
        }
        expect(emissions.length).toBe(1);
      });
      expect(emitted).toBe(1);
    });

    it('toggle off: vitals_critical=false → 0 emitidas', async () => {
      const u = await signup();
      await api().patch('/v1/me').set(u.auth).send({ notificationPrefs: { vitals_critical: false } }).expect(200);
      const dispatcher = app.get(NotificationDispatcherService);

      await withCaptured(async (emissions) => {
        const emitted = await dispatcher.dispatch(u.userId, u.petId, 'vitals_critical', {}, dayNoon);
        expect(emitted).toBe(false);
        expect(emissions.length).toBe(0);
      });
    });

    it('quiet hours: 03:00 local → 0 emitidas', async () => {
      const u = await signup();
      const dispatcher = app.get(NotificationDispatcherService);

      await withCaptured(async (emissions) => {
        const emitted = await dispatcher.dispatch(u.userId, u.petId, 'interaction', {}, new Date('2026-06-15T03:00:00Z'));
        expect(emitted).toBe(false);
        expect(emissions.length).toBe(0);
      });
    });
  });
});
