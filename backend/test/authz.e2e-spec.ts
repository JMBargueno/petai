import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Autorización por roles (e2e).
 *   - Toda cuenta nueva es `user` (y el cliente no puede elegir rol al registrarse).
 *   - GET /v1/admin/users y PATCH /v1/admin/users/:id/role exigen permisos (superadmin, admin y moderator; solo los dos primeros cambian roles).
 *   - Un cambio de rol aplica al instante, cierra las sesiones del afectado y queda auditado.
 */
describe('Autorización por roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(extra: Record<string, unknown> = {}) {
    const email = `authz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api().post('/v1/auth/register').send({ email, password: 'Password123!', ...extra }).expect(201);
    createdUsers.push(reg.body.user.id);
    return { token: reg.body.accessToken as string, refreshToken: reg.body.refreshToken as string, userId: reg.body.user.id as string, body: reg.body };
  }

  async function superadmin() {
    const s = await signup();
    await prisma.user.update({ where: { id: s.userId }, data: { role: 'superadmin' } });
    return s;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUsers } } }).catch(() => {});
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  it('una cuenta nueva es user, aunque el registro intente otro rol', async () => {
    const { token, body, userId } = await signup({ role: 'superadmin' });
    expect(body.user.role).toBe('user');
    const me = await api().get('/v1/me').set(auth(token)).expect(200);
    expect(me.body.role).toBe('user');
    expect(me.body.permissions).toEqual([]);
    const db = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(db.role).toBe('user');
  });

  it('la BD rechaza roles desconocidos', async () => {
    const { userId } = await signup();
    await expect(prisma.user.update({ where: { id: userId }, data: { role: 'root' } })).rejects.toThrow();
  });

  it('un user no accede a los endpoints de administración', async () => {
    const { token, userId } = await signup();
    await api().get('/v1/admin/users').set(auth(token)).expect(403);
    await api().patch(`/v1/admin/users/${userId}/role`).set(auth(token)).send({ role: 'admin' }).expect(403);
    await api().get('/v1/admin/users').expect(401);
  });

  it('admin y moderator entran al panel y listan usuarios', async () => {
    for (const role of ['admin', 'moderator']) {
      const { token, userId } = await signup();
      await prisma.user.update({ where: { id: userId }, data: { role } });
      await api().get('/v1/admin/users').set(auth(token)).expect(200);
      const me = await api().get('/v1/me').set(auth(token)).expect(200);
      expect(me.body.permissions).toContain('admin:access');
    }
  });

  it('moderator no cambia roles; admin solo por debajo del suyo', async () => {
    const mod = await signup();
    await prisma.user.update({ where: { id: mod.userId }, data: { role: 'moderator' } });
    const target = await signup();
    await api().patch(`/v1/admin/users/${target.userId}/role`).set(auth(mod.token)).send({ role: 'moderator' }).expect(403);

    const admin = await signup();
    await prisma.user.update({ where: { id: admin.userId }, data: { role: 'admin' } });
    await api().patch(`/v1/admin/users/${target.userId}/role`).set(auth(admin.token)).send({ role: 'admin' }).expect(403);
    await api().patch(`/v1/admin/users/${target.userId}/role`).set(auth(admin.token)).send({ role: 'moderator' }).expect(200);
  });

  it('superadmin lista usuarios y filtra por rol', async () => {
    const sa = await superadmin();
    const res = await api().get('/v1/admin/users?role=superadmin&pageSize=100').set(auth(sa.token)).expect(200);
    expect(res.body.items.map((u: any) => u.id)).toContain(sa.userId);
    expect(res.body.items.every((u: any) => u.role === 'superadmin')).toBe(true);
    expect(res.body.items[0]).not.toHaveProperty('passwordHash');
    const me = await api().get('/v1/me').set(auth(sa.token)).expect(200);
    expect(me.body.permissions).toEqual(expect.arrayContaining(['admin:access', 'users:read', 'users:role:assign']));
  });

  it('superadmin cambia un rol: aplica al instante, cierra sesiones y queda auditado', async () => {
    const sa = await superadmin();
    const target = await signup();

    const res = await api().patch(`/v1/admin/users/${target.userId}/role`).set(auth(sa.token)).send({ role: 'moderator' }).expect(200);
    expect(res.body.role).toBe('moderator');

    // El access token sigue siendo válido pero ya refleja el rol nuevo (se lee de BD en cada petición)
    const me = await api().get('/v1/me').set(auth(target.token)).expect(200);
    expect(me.body.role).toBe('moderator');

    // Sus refresh tokens se han revocado
    await api().post('/v1/auth/refresh').send({ refreshToken: target.refreshToken }).expect(401);

    const log = await prisma.auditLog.findFirst({ where: { userId: target.userId, event: 'role_change' } });
    expect(log?.metadata).toMatchObject({ from: 'user', to: 'moderator', by: sa.userId });
  });

  it('valida el rol, el id y no permite cambiar el rol propio', async () => {
    const sa = await superadmin();
    const target = await signup();
    await api().patch(`/v1/admin/users/${target.userId}/role`).set(auth(sa.token)).send({ role: 'root' }).expect(400);
    await api().patch('/v1/admin/users/no-es-uuid/role').set(auth(sa.token)).send({ role: 'admin' }).expect(400);
    await api().patch('/v1/admin/users/00000000-0000-4000-8000-000000000000/role').set(auth(sa.token)).send({ role: 'admin' }).expect(404);
    await api().patch(`/v1/admin/users/${sa.userId}/role`).set(auth(sa.token)).send({ role: 'user' }).expect(400);
  });
});
