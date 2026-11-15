import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthThrottleService } from '../src/modules/auth/auth-throttle.service';

/**
 * Invitaciones de registro (e2e).
 *   - Con el modo "solo con invitación" desactivado, cualquiera se registra.
 *   - Activado, el registro exige un código válido; los códigos se agotan, caducan y se revocan.
 *   - Solo quien tiene `invites:manage` (superadmin y admin) gestiona códigos y el ajuste.
 */
describe('Invitaciones de registro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createdUsers: string[] = [];
  const createdInvites: string[] = [];
  let initialInviteOnly = false;
  let adminToken = '';

  const email = () => `invites_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;

  async function register(extra: Record<string, unknown> = {}) {
    const res = await api().post('/v1/auth/register').send({ email: email(), password: 'Password123!', ...extra });
    if (res.status === 201) createdUsers.push(res.body.user.id);
    return res;
  }

  const setInviteOnly = (inviteOnly: boolean) =>
    api().patch('/v1/admin/registration-settings').set(auth(adminToken)).send({ inviteOnly }).expect(200);

  async function createInvite(body: Record<string, unknown> = {}) {
    const res = await api().post('/v1/admin/invites').set(auth(adminToken)).send(body).expect(201);
    createdInvites.push(...res.body.items.map((i: { id: string }) => i.id));
    return res.body.items[0] as { id: string; code: string; status: string; maxUses: number };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    await app.get(AuthThrottleService).reset();

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    initialInviteOnly = settings?.registrationInviteOnly ?? false;
    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, registrationInviteOnly: false }, update: { registrationInviteOnly: false } });

    const admin = await register();
    await prisma.user.update({ where: { id: admin.body.user.id }, data: { role: 'superadmin' } });
    adminToken = admin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.appSettings.update({ where: { id: 1 }, data: { registrationInviteOnly: initialInviteOnly } }).catch(() => {});
    await prisma.inviteCode.deleteMany({ where: { id: { in: createdInvites } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUsers } } }).catch(() => {});
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  it('un user normal no gestiona invitaciones ni el ajuste', async () => {
    const user = await register();
    const token = user.body.accessToken;
    await api().get('/v1/admin/invites').set(auth(token)).expect(403);
    await api().post('/v1/admin/invites').set(auth(token)).send({}).expect(403);
    await api().patch('/v1/admin/registration-settings').set(auth(token)).send({ inviteOnly: true }).expect(403);
    await api().get('/v1/admin/registration-settings').expect(401);
  });

  it('con el modo desactivado el registro es libre y la config pública lo indica', async () => {
    await api().get('/v1/auth/registration-config').expect(200, { inviteRequired: false });
    await register().then((r) => expect(r.status).toBe(201));
    // Un código cualquiera se ignora con el modo desactivado
    await register({ inviteCode: 'NADA-NADA' }).then((r) => expect(r.status).toBe(201));
  });

  it('flujo completo con el modo activo: sin código, con código, agotado y revocado', async () => {
    await setInviteOnly(true);
    await api().get('/v1/auth/registration-config').expect(200, { inviteRequired: true });
    await api().get('/v1/admin/registration-settings').set(auth(adminToken)).expect(200, { inviteOnly: true });

    // Sin código o con uno inexistente → 403 y no se crea el usuario
    const noCode = await register();
    expect(noCode.status).toBe(403);
    expect(noCode.body.message).toBe('El registro requiere un código de invitación');
    expect((await register({ inviteCode: 'ZZZZ-ZZZZ' })).status).toBe(403);

    // Código de un uso: el primero entra (en minúsculas y con espacios), el segundo no
    const single = await createInvite({ note: 'e2e' });
    expect(single.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(single.status).toBe('active');
    const ok = await register({ inviteCode: `  ${single.code.toLowerCase()} ` });
    expect(ok.status).toBe(201);
    const redemption = await prisma.inviteRedemption.findUnique({ where: { userId: ok.body.user.id } });
    expect(redemption?.inviteCodeId).toBe(single.id);
    expect((await register({ inviteCode: single.code })).status).toBe(403);

    const usedList = await api().get('/v1/admin/invites?status=used').set(auth(adminToken)).expect(200);
    expect(usedList.body.items.map((i: { id: string }) => i.id)).toContain(single.id);

    // Código multiuso revocado antes de agotarse
    const multi = await createInvite({ maxUses: 3 });
    expect((await register({ inviteCode: multi.code })).status).toBe(201);
    const revoked = await api().post(`/v1/admin/invites/${multi.id}/revoke`).set(auth(adminToken)).expect(200);
    expect(revoked.body.status).toBe('revoked');
    expect((await register({ inviteCode: multi.code })).status).toBe(403);
    // Revocar dos veces es idempotente
    await api().post(`/v1/admin/invites/${multi.id}/revoke`).set(auth(adminToken)).expect(200);

    // Código caducado (se fuerza la fecha en BD porque la API solo acepta fechas futuras)
    const expiring = await createInvite({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await prisma.inviteCode.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await register({ inviteCode: expiring.code })).status).toBe(403);

    // Desactivar el modo vuelve a abrir el registro
    await setInviteOnly(false);
    expect((await register()).status).toBe(201);
  });

  it('dos registros simultáneos no exceden maxUses', async () => {
    await setInviteOnly(true);
    try {
      const invite = await createInvite({ maxUses: 1 });
      const results = await Promise.all([register({ inviteCode: invite.code }), register({ inviteCode: invite.code }), register({ inviteCode: invite.code })]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const row = await prisma.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
      expect(row.usedCount).toBe(1);
    } finally {
      await setInviteOnly(false);
    }
  });

  it('valida la generación de códigos y queda auditada', async () => {
    await api().post('/v1/admin/invites').set(auth(adminToken)).send({ count: 51 }).expect(400);
    await api().post('/v1/admin/invites').set(auth(adminToken)).send({ maxUses: 0 }).expect(400);
    await api().post('/v1/admin/invites').set(auth(adminToken)).send({ expiresAt: '2000-01-01T00:00:00Z' }).expect(400);
    const res = await api().post('/v1/admin/invites').set(auth(adminToken)).send({ count: 3 }).expect(201);
    createdInvites.push(...res.body.items.map((i: { id: string }) => i.id));
    expect(res.body.items).toHaveLength(3);
    const adminId = (await api().get('/v1/me').set(auth(adminToken)).expect(200)).body.id;
    const audit = await prisma.auditLog.findFirst({ where: { userId: adminId, event: 'invite_create' }, orderBy: { createdAt: 'desc' } });
    expect(audit).toBeTruthy();
  });
});
