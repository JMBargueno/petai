import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Usuarios / Perfil (e2e) — camino feliz.
 *
 * Rutas cubiertas (users.controller.ts, prefijo global `v1`):
 *   - GET   /v1/me  → perfil del usuario autenticado
 *   - PATCH /v1/me  → actualizar preferencias del usuario (parcial y validado)
 *
 * El módulo "Users" expone el perfil de cuenta y sus preferencias. El camino feliz:
 * leer el perfil y actualizarlo de forma parcial + validada, comprobando que el
 * cambio persiste en BD, que los campos no enviados no se tocan y que el endpoint
 * no es vulnerable a mass-assignment (coins/gems/etc. no son editables desde aquí).
 */
describe('Usuarios / Perfil (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `users_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
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

  describe('GET /me', () => {
    it('devuelve 200 con el perfil del usuario autenticado', async () => {
      const { token, userId } = await signup();
      const res = await api().get('/v1/me').set(auth(token)).expect(200);
      const body = res.body;

      expect(body.id).toBe(userId);
      expect(typeof body.email).toBe('string');
      expect(typeof body.displayName).toBe('string');
      expect(typeof body.coins).toBe('number');
      expect(typeof body.gems).toBe('number');
      expect(typeof body.accountXp).toBe('number');
      // Un usuario nuevo aún no tiene prefs de notificación → null (el cliente aplica defaults).
      expect(body.notificationPrefs).toBeNull();
      // createdAt se serializa como fecha válida.
      expect(new Date(body.createdAt).getTime()).not.toBeNaN();
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/me').expect(401);
    });
  });

  describe('PATCH /me', () => {
    it('actualiza displayName, timezone y birthday; el cambio persiste y se devuelve', async () => {
      const { token, userId } = await signup();
      const res = await api()
        .patch('/v1/me')
        .set(auth(token))
        .send({ displayName: 'Pockai Fan', timezone: 'Europe/Madrid', birthday: '1998-06-15' })
        .expect(200);
      const body = res.body;

      expect(body.displayName).toBe('Pockai Fan');
      expect(body.timezone).toBe('Europe/Madrid');
      expect(body.birthday).toBe('1998-06-15');

      // Persistencia real en BD.
      const row = await prisma.user.findUnique({ where: { id: userId } });
      expect(row!.displayName).toBe('Pockai Fan');
      expect(row!.timezone).toBe('Europe/Madrid');
      expect(row!.birthday).toBe('1998-06-15');
    });

    it('es una actualización parcial: los campos no enviados no cambian', async () => {
      const { token } = await signup();
      const before = await api().get('/v1/me').set(auth(token)).expect(200);
      await api()
        .patch('/v1/me')
        .set(auth(token))
        .send({ displayName: 'Solo el nombre' })
        .expect(200);
      const after = await api().get('/v1/me').set(auth(token)).expect(200);

      expect(after.body.displayName).toBe('Solo el nombre');
      expect(after.body.timezone).toBe(before.body.timezone);
      expect(after.body.latitude).toBe(before.body.latitude);
      expect(after.body.birthday).toBe(before.body.birthday);
    });

    it('redondea las coordenadas a 2 decimales (opt-in de privacidad)', async () => {
      const { token } = await signup();
      const res = await api()
        .patch('/v1/me')
        .set(auth(token))
        .send({ latitude: 40.123456, longitude: -3.456 })
        .expect(200);
      expect(res.body.latitude).toBe(40.12);
      expect(res.body.longitude).toBe(-3.46);
    });

    it('acepta null para borrar las coordenadas (opt-out)', async () => {
      const { token } = await signup();
      await api()
        .patch('/v1/me')
        .set(auth(token))
        .send({ latitude: 40.12, longitude: -3.46 })
        .expect(200);
      const res = await api()
        .patch('/v1/me')
        .set(auth(token))
        .send({ latitude: null, longitude: null })
        .expect(200);
      expect(res.body.latitude).toBeNull();
      expect(res.body.longitude).toBeNull();
    });

    it('ignora campos ajenos al perfil (mass-assignment): coins/gems no se tocan', async () => {
      const { token } = await signup();
      const before = await api().get('/v1/me').set(auth(token)).expect(200);
      const res = await api()
        .patch('/v1/me')
        .set(auth(token))
        .send({ displayName: 'Safe', coins: 999999, gems: 888 })
        .expect(200);
      expect(res.body.displayName).toBe('Safe');
      expect(res.body.coins).toBe(before.body.coins);
      expect(res.body.gems).toBe(before.body.gems);
    });

    it('rechaza un displayName no válido (400)', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ displayName: 123 }).expect(400);
      await api().patch('/v1/me').set(auth(token)).send({ displayName: 'a'.repeat(51) }).expect(400);
    });

    it('rechaza un timezone IANA inválido (400)', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ timezone: 'Not/AZone' }).expect(400);
    });

    it('rechaza coordenadas fuera de rango (400)', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ latitude: 91 }).expect(400);
      await api().patch('/v1/me').set(auth(token)).send({ longitude: 200 }).expect(400);
    });

    it('rechaza un birthday no válido (400)', async () => {
      const { token } = await signup();
      await api().patch('/v1/me').set(auth(token)).send({ birthday: 'not-a-date' }).expect(400);
      await api().patch('/v1/me').set(auth(token)).send({ birthday: '2000-02-30' }).expect(400);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().patch('/v1/me').send({ displayName: 'X' }).expect(401);
    });
  });
});
