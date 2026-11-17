import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateEnv } from '../src/config/env.config';

/**
 * Nickname público (@handle) — e2e contra la base de datos real.
 *
 * Cubre: registro con nickname, unicidad sin distinguir mayúsculas, disponibilidad pública,
 * fijarlo una sola vez (POST /me/handle), inmutabilidad (PATCH /me y trigger de la BD), el bloqueo
 * HANDLE_REQUIRED y la búsqueda de jugadores por nickname (perfil, amigos y clanes).
 *
 * HANDLE_REQUIRED se activa sustituyendo el ConfigService (igual que email-verification.e2e-spec).
 */
const PW = 'Contrasena-Segura-123';

describe('Nickname público (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const created: string[] = [];

  const overrides: Record<string, string> = { HANDLE_REQUIRED: 'true' };
  const real = new ConfigService(validateEnv(process.env));
  const config = new Proxy(real, {
    get(target, prop) {
      if (prop === 'get') {
        return (key: string, ...rest: unknown[]) => (key in overrides ? overrides[key] : (target.get as any)(key, ...rest));
      }
      const v = (target as any)[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const newHandle = () => `nk_${uniq()}`.slice(0, 20);

  async function register(handle?: string) {
    const email = `nick_${uniq()}@petai.local`;
    const res = await api()
      .post('/v1/auth/register')
      .send({ email, password: PW, ...(handle !== undefined ? { handle } : {}) })
      .expect(201);
    created.push(res.body.user.id);
    return { email, userId: res.body.user.id as string, token: res.body.accessToken as string, body: res.body };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService).useValue(config).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.clanMembership.deleteMany({ where: { userId: { in: created } } }).catch(() => {});
    await prisma.clan.deleteMany({ where: { leaderId: { in: created } } }).catch(() => {});
    for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  it('registra con nickname normalizado y lo devuelve en la sesión y en /me', async () => {
    const h = newHandle();
    const u = await register(`@${h.toUpperCase()}`);
    expect(u.body.user.handle).toBe(h);
    const me = await api().get('/v1/me').set(auth(u.token)).expect(200);
    expect(me.body.handle).toBe(h);
  });

  it('409 si el nickname ya está en uso, aunque cambien las mayúsculas', async () => {
    const h = newHandle();
    await register(h);
    const res = await api()
      .post('/v1/auth/register')
      .send({ email: `nick_${uniq()}@petai.local`, password: PW, handle: h.toUpperCase() })
      .expect(409);
    expect(res.body.message).toBe('Ese nickname ya está en uso');
  });

  it('400 con un nickname reservado o mal formado', async () => {
    for (const handle of ['admin', 'ab', '9lives', 'con espacio', 'fin.']) {
      await api()
        .post('/v1/auth/register')
        .send({ email: `nick_${uniq()}@petai.local`, password: PW, handle })
        .expect(400);
    }
  });

  it('GET /auth/handle-available es público e indica si está libre', async () => {
    const h = newHandle();
    const free = await api().get('/v1/auth/handle-available').query({ handle: h }).expect(200);
    expect(free.body).toEqual({ handle: h, available: true });
    await register(h);
    const taken = await api().get('/v1/auth/handle-available').query({ handle: `@${h}` }).expect(200);
    expect(taken.body).toMatchObject({ available: false, reason: 'Ese nickname ya está en uso' });
    const bad = await api().get('/v1/auth/handle-available').query({ handle: 'x' }).expect(200);
    expect(bad.body.available).toBe(false);
  });

  it('cuenta sin nickname: 403 HANDLE_REQUIRED hasta elegirlo; después se desbloquea', async () => {
    const u = await register();
    expect(u.body.user.handle).toBeNull();
    // /me sigue accesible (las apps lo usan para decidir qué pantalla mostrar)
    await api().get('/v1/me').set(auth(u.token)).expect(200);
    const blocked = await api().get('/v1/eggs').set(auth(u.token)).expect(403);
    expect(blocked.body.code).toBe('HANDLE_REQUIRED');

    const h = newHandle();
    const set = await api().post('/v1/me/handle').set(auth(u.token)).send({ handle: h }).expect(200);
    expect(set.body.handle).toBe(h);
    await api().get('/v1/eggs').set(auth(u.token)).expect(200);
  });

  it('el nickname solo se fija una vez y no se cambia por la API ni por SQL', async () => {
    const h = newHandle();
    const u = await register(h);

    const again = await api().post('/v1/me/handle').set(auth(u.token)).send({ handle: newHandle() }).expect(409);
    expect(again.body.message).toContain('no se puede cambiar');
    await api().patch('/v1/me').set(auth(u.token)).send({ handle: newHandle() }).expect(400);

    // Defensa en profundidad: el trigger de la BD rechaza cambiarlo o vaciarlo.
    await expect(prisma.user.update({ where: { id: u.userId }, data: { handle: newHandle() } })).rejects.toThrow();
    await expect(prisma.user.update({ where: { id: u.userId }, data: { handle: null } })).rejects.toThrow();
    // Reescribir el mismo valor sí se permite (upserts del seed).
    await prisma.user.update({ where: { id: u.userId }, data: { handle: h } });
    expect((await prisma.user.findUnique({ where: { id: u.userId } }))?.handle).toBe(h);
  });

  it('POST /me/handle: 409 si otra cuenta ya lo usa', async () => {
    const h = newHandle();
    await register(h);
    const u = await register();
    await api().post('/v1/me/handle').set(auth(u.token)).send({ handle: h }).expect(409);
  });

  it('GET /users/by-handle/:handle devuelve el perfil público mínimo', async () => {
    const h = newHandle();
    const target = await register(h);
    const viewer = await register(newHandle());
    const res = await api().get(`/v1/users/by-handle/@${h}`).set(auth(viewer.token)).expect(200);
    expect(res.body).toMatchObject({ id: target.userId, handle: h });
    expect(res.body.email).toBeUndefined();
    await api().get(`/v1/users/by-handle/${newHandle()}`).set(auth(viewer.token)).expect(404);
  });

  it('amigos y clanes se buscan por @nickname', async () => {
    const a = await register(newHandle());
    const bHandle = newHandle();
    const b = await register(bHandle);

    const fr = await api().post('/v1/coop/friends').set(auth(a.token)).send({ handle: `@${bHandle}` }).expect(200);
    expect(fr.body).toMatchObject({ otherUserId: b.userId, otherHandle: bHandle });

    const tag = `N${uniq().slice(-6)}`.toUpperCase();
    const clan = await api()
      .post('/v1/clans')
      .set(auth(a.token))
      .send({ name: `Clan ${uniq()}`, tag })
      .expect((r) => expect([200, 201]).toContain(r.status));
    const inv = await api().post(`/v1/clans/${clan.body.id}/invite`).set(auth(a.token)).send({ handle: bHandle }).expect(200);
    const member = inv.body.members.find((m: any) => m.userId === b.userId);
    expect(member).toMatchObject({ handle: bHandle });
  });
});
