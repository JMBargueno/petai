import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthThrottleService } from '../src/modules/auth/auth-throttle.service';

const PASSWORD = 'Contrasena-Segura-123';

describe('Endurecimiento: SSRF, abuso de recompensas, sesiones y límites (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: ConfigService;
  const api = () => request(app.getHttpServer());
  const uniqueEmail = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;

  async function signup(prefix = 'hard') {
    const email = uniqueEmail(prefix);
    const reg = await api().post('/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    return { email, auth, userId: reg.body.user.id as string, refreshToken: reg.body.refreshToken as string };
  }
  async function hatch(auth: { Authorization: string }) {
    const eggs = await api().get('/v1/eggs').set(auth).expect(200);
    return (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201)).body.id as string;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    config = app.get(ConfigService);
  });
  afterAll(async () => app.close());

  describe('SSRF en la URL del proveedor de IA', () => {
    it('rechaza IPv4 privadas escritas dentro de una IPv6 (mapeadas, compatibles, NAT64) y formas numéricas', async () => {
      config.set('AI_ALLOW_INSECURE_URLS', 'false');
      const { auth } = await signup('ssrf');
      for (const baseUrl of [
        'https://[::ffff:127.0.0.1]/v1',
        'https://[::ffff:7f00:1]/v1',
        'https://[::ffff:169.254.169.254]/latest',
        'https://[::ffff:a9fe:a9fe]/latest',
        'https://[::127.0.0.1]/v1',
        'https://[64:ff9b::10.0.0.1]/v1',
        'https://[2002:c0a8:101::1]/v1',
        'https://2130706433/v1',
      ]) {
        const res = await api().put('/v1/ai/config').set(auth).send({ provider: 'custom', baseUrl, model: 'm', apiKey: 'sk-test-12345678' });
        expect({ baseUrl, status: res.status }).toEqual({ baseUrl, status: 400 });
      }
      expect((await api().get('/v1/ai/config').set(auth).expect(200)).body.configured).toBe(false);
    });
  });

  describe('baño de la mascota', () => {
    it('solo da XP cuando la mascota lo necesita: repetirlo no sube de nivel', async () => {
      const { auth } = await signup('clean');
      const petId = await hatch(auth);

      // Recién nacida (higiene 100): no hay nada que limpiar
      await api().post(`/v1/pets/${petId}/clean`).set(auth).expect(400);

      await prisma.pet.update({ where: { id: petId }, data: { hygiene: 40, lastTickAt: new Date() } });
      const before = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
      const cleaned = await api().post(`/v1/pets/${petId}/clean`).set(auth).expect(201);
      expect(cleaned.body.hygiene).toBe(100);
      expect(cleaned.body.xp).toBe(before.xp + 10);

      for (let i = 0; i < 10; i++) await api().post(`/v1/pets/${petId}/clean`).set(auth).expect(400);
      const after = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
      expect({ xp: after.xp, level: after.level }).toEqual({ xp: before.xp + 10, level: before.level });
    });
  });

  describe('minijuegos', () => {
    it('una puntuación desorbitada se rechaza sin llegar a guardarse y cierra la sesión', async () => {
      const { auth } = await signup('score');
      const petId = await hatch(auth);
      const start = await api().post('/v1/minigames/reflex/start').set(auth).send({ petId }).expect(201);
      await api().post(`/v1/minigames/sessions/${start.body.sessionId}/finish`).set(auth).send({ score: 2_000_000_000 }).expect(400);
      const row = await prisma.minigameSession.findUniqueOrThrow({ where: { id: start.body.sessionId } });
      expect({ score: row.score, rewarded: row.rewarded, closed: row.finishedAt !== null }).toEqual({ score: 0, rewarded: false, closed: true });
      await api().post(`/v1/minigames/sessions/${start.body.sessionId}/finish`).set(auth).send({ score: 1 }).expect(400);
    });
  });

  describe('vinculación de dispositivos', () => {
    it('un código ya confirmado no se puede reasignar a otra cuenta', async () => {
      const owner = await signup('link-owner');
      const intruder = await signup('link-intruder');
      const { code, pollToken } = (await api().post('/v1/auth/device/start').expect(200)).body;

      await api().post('/v1/auth/device/confirm').set(owner.auth).send({ code }).expect(200);
      await api().post('/v1/auth/device/confirm').set(intruder.auth).send({ code }).expect(409);
      await api().post('/v1/auth/device/confirm').set(owner.auth).send({ code }).expect(409);

      const done = await api().post('/v1/auth/device/poll').send({ pollToken }).expect(200);
      expect(done.body.status).toBe('confirmed');
      expect(done.body.user.email).toBe(owner.email);
    });

    it('dos confirmaciones simultáneas de cuentas distintas: solo una gana', async () => {
      const a = await signup('link-a');
      const b = await signup('link-b');
      const { code, pollToken } = (await api().post('/v1/auth/device/start').expect(200)).body;
      const rs = await Promise.all([
        api().post('/v1/auth/device/confirm').set(a.auth).send({ code }),
        api().post('/v1/auth/device/confirm').set(b.auth).send({ code }),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = rs[0].status === 200 ? a : b;
      const done = await api().post('/v1/auth/device/poll').send({ pollToken }).expect(200);
      expect(done.body.user.email).toBe(winner.email);
    });
  });

  describe('sesiones', () => {
    const login = async (email: string, password = PASSWORD) => api().post('/v1/auth/login').send({ email, password });

    it('logout-all revoca todos los refresh tokens del usuario (y solo los suyos)', async () => {
      const u = await signup('all');
      const other = await signup('all-other');
      const second = (await login(u.email).then((r) => r.body)) as { accessToken: string; refreshToken: string };

      await api().post('/v1/auth/logout-all').expect(401);
      const res = await api().post('/v1/auth/logout-all').set(u.auth).expect(200);
      expect(res.body).toEqual({ ok: true, revoked: 2 });

      await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: other.refreshToken }).expect(200);
      // Se puede volver a entrar con la contraseña
      expect((await login(u.email)).status).toBe(200);
    });

    it('cambio de contraseña: exige la actual, valida la nueva, cierra las demás sesiones y devuelve una nueva', async () => {
      const u = await signup('pwd');
      const other = (await login(u.email).then((r) => r.body)) as { refreshToken: string };
      const NEW = 'Otra-Contrasena-456';
      const change = (body: unknown) => api().post('/v1/auth/password').set(u.auth).send(body as object);

      await api().post('/v1/auth/password').send({ currentPassword: PASSWORD, newPassword: NEW }).expect(401);
      await change({ currentPassword: 'no-es-la-actual', newPassword: NEW }).expect(403);
      await change({ currentPassword: PASSWORD, newPassword: 'corta' }).expect(400);
      await change({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);
      await change({ currentPassword: PASSWORD }).expect(400);
      await change({ currentPassword: 5, newPassword: ['x'] }).expect(400);
      // Ningún intento fallido cambió nada
      expect((await login(u.email)).status).toBe(200);

      const ok = await change({ currentPassword: PASSWORD, newPassword: NEW, passwordHash: 'x', email: 'otro@x.io' }).expect(200);
      expect(ok.body.accessToken).toBeTruthy();
      expect(JSON.stringify(ok.body)).not.toContain('passwordHash');

      await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: other.refreshToken }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: ok.body.refreshToken }).expect(200);
      expect((await login(u.email)).status).toBe(401);
      expect((await login(u.email, NEW)).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).email).toBe(u.email);
    });
  });

  describe('límites de peticiones', () => {
    afterEach(async () => {
      for (const k of ['RATE_LIMIT_FORCE', 'RATE_LIMIT_PER_MINUTE', 'AUTH_RATE_LIMIT_FORCE', 'AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT_GLOBAL']) config.set(k, undefined);
      await app.get(AuthThrottleService).reset();
    });

    it('límite global: por IP sin sesión y por usuario con sesión; /health queda fuera', async () => {
      const u = await signup('rate');
      await app.get(AuthThrottleService).reset();
      config.set('RATE_LIMIT_FORCE', 'true');
      config.set('RATE_LIMIT_PER_MINUTE', 5);

      for (let i = 0; i < 5; i++) await api().get('/v1/catalog').expect(200);
      const blocked = await api().get('/v1/catalog').expect(429);
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      // Un token inventado no abre un cupo nuevo: sigue contando por IP
      await api().get('/v1/catalog').set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.').expect(429);

      // El usuario autenticado tiene su propio cupo, y también se agota
      for (let i = 0; i < 5; i++) await api().get('/v1/me').set(u.auth).expect(200);
      await api().get('/v1/me').set(u.auth).expect(429);

      await api().get('/v1/health').expect(200);
    });

    it('los fallos de login sobre una cuenta desde cualquier IP también la bloquean', async () => {
      const u = await signup('acct');
      await app.get(AuthThrottleService).reset();
      config.set('AUTH_RATE_LIMIT_FORCE', 'true');
      config.set('AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT_GLOBAL', 3);
      const throttle = app.get(AuthThrottleService);
      // Tres fallos llegados desde otras direcciones (no cuentan para cuenta+IP de este cliente)
      for (let i = 0; i < 3; i++) await throttle.add(`login-acct:${u.email}`, 15 * 60_000);
      await api().post('/v1/auth/login').send({ email: u.email, password: PASSWORD }).expect(429);
    });
  });

  describe('arena', () => {
    it('dos combates simultáneos contra el mismo defensor conservan ambas variaciones de ELO', async () => {
      const top = (await prisma.pet.aggregate({ _max: { elo: true } }))._max.elo ?? 0;
      const band = top + 50_000 + Math.floor(Math.random() * 1000);
      const make = async (elo: number) => {
        const u = await signup('elo');
        const petId = await hatch(u.auth);
        await prisma.pet.update({ where: { id: petId }, data: { elo, level: 5 } });
        return { ...u, petId };
      };
      // Los atacantes quedan fuera de la ventana de emparejamiento del otro: su único rival posible es el defensor
      const defender = await make(band + 350);
      const [a, b] = [await make(band), await make(band + 700)];

      const [ra, rb] = await Promise.all(
        [a, b].map((u) => api().post('/v1/battles/matchmake').set(u.auth).send({ petId: u.petId }).expect(201)),
      );
      expect([ra.body.opponent.isBot, rb.body.opponent.isBot]).toEqual([false, false]);

      const row = await prisma.pet.findUniqueOrThrow({ where: { id: defender.petId } });
      expect(row.elo).toBe(band + 350 - ra.body.elo.delta - rb.body.elo.delta);
      for (const [u, r] of [[a, ra], [b, rb]] as const) {
        expect((await prisma.pet.findUniqueOrThrow({ where: { id: u.petId } })).elo).toBe(r.body.elo.after);
      }
    });
  });
});
