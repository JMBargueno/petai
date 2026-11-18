import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthThrottleService } from '../src/modules/auth/auth-throttle.service';

/**
 * Ajustes de la web pública (e2e).
 *   - `GET /v1/site/config` es público y refleja la invitación y la landing «Coming soon».
 *   - Solo quien tiene `site:manage` (superadmin y admin) lee y cambia los ajustes.
 *   - La descarga del escritorio exige sesión con el correo verificado.
 */
describe('Ajustes del sitio (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createdUsers: string[] = [];
  let initial: Record<string, unknown> | null = null;
  let adminToken = '';

  const email = () => `site_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;

  async function register() {
    const res = await api().post('/v1/auth/register').send({ email: email(), password: 'Password123!' }).expect(201);
    createdUsers.push(res.body.user.id);
    return res.body as { accessToken: string; user: { id: string } };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    await app.get(AuthThrottleService).reset();

    initial = await prisma.appSettings.findUnique({
      where: { id: 1 },
      select: {
        comingSoonEnabled: true,
        comingSoonCountdownEnabled: true,
        comingSoonLaunchAt: true,
        maintenanceEnabled: true,
        maintenanceScope: true,
        maintenanceMessageEs: true,
        maintenanceMessageEn: true,
      },
    });
    await prisma.appSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {
        comingSoonEnabled: false,
        comingSoonCountdownEnabled: false,
        comingSoonLaunchAt: null,
        maintenanceEnabled: false,
        maintenanceScope: 'all',
        maintenanceMessageEs: null,
        maintenanceMessageEn: null,
      },
    });

    const admin = await register();
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'admin' } });
    adminToken = admin.accessToken;
  });

  afterAll(async () => {
    // Imprescindible: un mantenimiento olvidado activo rompería el resto de suites (--runInBand).
    await prisma.appSettings
      .update({ where: { id: 1 }, data: initial ?? { maintenanceEnabled: false } })
      .catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUsers } } }).catch(() => {});
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  it('la configuración pública no necesita sesión', async () => {
    const res = await api().get('/v1/site/config').expect(200);
    expect(res.body.comingSoon).toEqual({ enabled: false, countdown: { enabled: false, launchAt: null } });
    expect(typeof res.body.inviteRequired).toBe('boolean');
  });

  it('un user normal no lee ni cambia los ajustes', async () => {
    const user = await register();
    await api().get('/v1/admin/site-settings').expect(401);
    await api().get('/v1/admin/site-settings').set(auth(user.accessToken)).expect(403);
    await api().patch('/v1/admin/site-settings').set(auth(user.accessToken)).send({ comingSoonEnabled: true }).expect(403);
  });

  it('un admin activa la landing y la cuenta atrás, y la web lo ve', async () => {
    const launchAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = await api()
      .patch('/v1/admin/site-settings')
      .set(auth(adminToken))
      .send({ comingSoonEnabled: true, comingSoonCountdownEnabled: true, comingSoonLaunchAt: launchAt })
      .expect(200);
    expect(res.body).toMatchObject({ comingSoonEnabled: true, comingSoonCountdownEnabled: true, comingSoonLaunchAt: launchAt });

    const pub = await api().get('/v1/site/config').expect(200);
    expect(pub.body.comingSoon).toEqual({ enabled: true, countdown: { enabled: true, launchAt } });

    // Actualización parcial: quitar la fecha no toca los interruptores
    const partial = await api().patch('/v1/admin/site-settings').set(auth(adminToken)).send({ comingSoonLaunchAt: null }).expect(200);
    expect(partial.body).toMatchObject({ comingSoonEnabled: true, comingSoonCountdownEnabled: true, comingSoonLaunchAt: null });
  });

  it('rechaza campos desconocidos o con tipo incorrecto', async () => {
    await api().patch('/v1/admin/site-settings').set(auth(adminToken)).send({ comingSoonEnabled: 'sí' }).expect(400);
    await api().patch('/v1/admin/site-settings').set(auth(adminToken)).send({ otro: true }).expect(400);
  });

  it('la descarga del escritorio exige sesión y correo verificado', async () => {
    await api().get('/v1/desktop/download/windows').expect(401);
    const user = await register();
    const res = await api().get('/v1/desktop/download/windows').set(auth(user.accessToken)).expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  describe('modo mantenimiento', () => {
    let user: { accessToken: string; user: { id: string } };
    const set = (body: Record<string, unknown>) =>
      api().patch('/v1/admin/site-settings').set(auth(adminToken)).send(body).expect(200);

    beforeAll(async () => {
      user = await register();
    });

    afterEach(async () => {
      await set({ maintenanceEnabled: false, maintenanceScope: 'all', maintenanceMessageEs: null, maintenanceMessageEn: null });
    });

    it('un admin lo activa con mensaje y la configuración pública lo refleja', async () => {
      const res = await set({ maintenanceEnabled: true, maintenanceScope: 'web', maintenanceMessageEs: 'Volvemos a las 18:00', maintenanceMessageEn: 'Back at 6pm' });
      expect(res.body).toMatchObject({ maintenanceEnabled: true, maintenanceScope: 'web', maintenanceMessageEs: 'Volvemos a las 18:00' });
      const pub = await api().get('/v1/site/config').expect(200);
      expect(pub.body.maintenance).toEqual({ enabled: true, scope: 'web', message: { es: 'Volvemos a las 18:00', en: 'Back at 6pm' } });
    });

    it('alcance web: bloquea la web y deja pasar las apps', async () => {
      await set({ maintenanceEnabled: true, maintenanceScope: 'web', maintenanceMessageEn: 'Back soon' });
      const blocked = await api().get('/v1/pets').set(auth(user.accessToken)).set('X-Client', 'web').expect(503);
      expect(blocked.body).toMatchObject({ code: 'MAINTENANCE', messages: { en: 'Back soon' } });
      expect(blocked.headers['retry-after']).toBe('60');
      const app = await api().get('/v1/pets').set(auth(user.accessToken)).set('X-Client', 'desktop');
      expect(app.status).not.toBe(503);
    });

    it('alcance apps: bloquea las apps (también sin cabecera) y deja pasar la web', async () => {
      await set({ maintenanceEnabled: true, maintenanceScope: 'apps' });
      await api().get('/v1/pets').set(auth(user.accessToken)).set('X-Client', 'android').expect(503);
      await api().get('/v1/pets').set(auth(user.accessToken)).expect(503);
      const web = await api().get('/v1/pets').set(auth(user.accessToken)).set('X-Client', 'web');
      expect(web.status).not.toBe(503);
    });

    it('siguen abiertos el login, /me, el contacto, la salud y el panel; el registro no', async () => {
      await set({ maintenanceEnabled: true, maintenanceScope: 'all' });
      await api().get('/v1/site/config').expect(200);
      await api().get('/v1/me').set(auth(user.accessToken)).expect(200);
      const login = await api().post('/v1/auth/login').send({ email: 'nadie@petai.local', password: 'Password123!' });
      expect(login.status).not.toBe(503);
      const contact = await api().post('/v1/contact').send({});
      expect(contact.status).not.toBe(503);
      const health = await api().get('/v1/health');
      expect(health.status).not.toBe(503);
      await api().post('/v1/auth/register').send({ email: email(), password: 'Password123!' }).expect(503);
    });

    it('los admins pasan a todas las rutas; un usuario normal no', async () => {
      await set({ maintenanceEnabled: true, maintenanceScope: 'all' });
      const asAdmin = await api().get('/v1/pets').set(auth(adminToken)).set('X-Client', 'web');
      expect(asAdmin.status).not.toBe(503);
      await api().get('/v1/pets').set(auth(user.accessToken)).set('X-Client', 'web').expect(503);
      await api().get('/v1/pets').set('Authorization', 'Bearer no-es-un-token').set('X-Client', 'web').expect(503);
    });

    it('al desactivarlo todo vuelve a funcionar', async () => {
      await set({ maintenanceEnabled: true });
      await api().get('/v1/pets').set(auth(user.accessToken)).expect(503);
      await set({ maintenanceEnabled: false });
      const res = await api().get('/v1/pets').set(auth(user.accessToken));
      expect(res.status).not.toBe(503);
    });

    it('rechaza un alcance desconocido', async () => {
      await api().patch('/v1/admin/site-settings').set(auth(adminToken)).send({ maintenanceScope: 'todo' }).expect(400);
    });
  });
});
