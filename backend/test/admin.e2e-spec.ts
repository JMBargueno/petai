import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthThrottleService } from '../src/modules/auth/auth-throttle.service';

/**
 * Panel de administración (e2e).
 *   - Cada endpoint exige su permiso: user → 403; moderator ve mascotas y registro pero no precios.
 *   - Un cambio de precio aplica en la tienda y queda en AuditLog.
 */
describe('Panel de administración (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createdUsers: string[] = [];
  const ITEM_ID = `e2e_admin_item_${Date.now()}`;

  async function signup(role = 'user') {
    const email = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api().post('/v1/auth/register').send({ email, password: 'Password123!' }).expect(201);
    createdUsers.push(reg.body.user.id);
    if (role !== 'user') await prisma.user.update({ where: { id: reg.body.user.id }, data: { role } });
    return { token: reg.body.accessToken as string, userId: reg.body.user.id as string };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    await app.get(AuthThrottleService).reset();
    await prisma.item.create({ data: { id: ITEM_ID, kind: 'food', name: 'Objeto e2e', description: '', effects: {}, priceCoins: 100, priceGems: 0 } });
  });

  afterAll(async () => {
    await prisma.item.delete({ where: { id: ITEM_ID } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUsers } } }).catch(() => {});
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  it('un user no entra a ningún endpoint del panel', async () => {
    const { token } = await signup();
    for (const path of ['/v1/admin/stats', '/v1/admin/items', '/v1/admin/species', '/v1/admin/pets', '/v1/admin/events', '/v1/admin/audit']) {
      await api().get(path).set(auth(token)).expect(403);
    }
    await api().get('/v1/admin/stats').expect(401);
  });

  it('moderator consulta mascotas, eventos y registro, pero no toca precios', async () => {
    const { token } = await signup('moderator');
    await api().get('/v1/admin/stats').set(auth(token)).expect(200);
    await api().get('/v1/admin/pets').set(auth(token)).expect(200);
    await api().get('/v1/admin/events').set(auth(token)).expect(200);
    await api().get('/v1/admin/audit').set(auth(token)).expect(200);
    await api().get('/v1/admin/items').set(auth(token)).expect(403);
    await api().patch(`/v1/admin/items/${ITEM_ID}`).set(auth(token)).send({ priceCoins: 1 }).expect(403);
  });

  it('admin cambia un precio: aplica en la tienda y queda auditado', async () => {
    const { token, userId } = await signup('admin');
    const res = await api().patch(`/v1/admin/items/${ITEM_ID}`).set(auth(token)).send({ priceCoins: 120 }).expect(200);
    expect(res.body.priceCoins).toBe(120);
    const shop = await api().get('/v1/shop').set(auth(token)).expect(200);
    expect(shop.body.find((i: { id: string }) => i.id === ITEM_ID)?.priceCoins).toBe(120);

    const bulk = await api().patch('/v1/admin/items/prices').set(auth(token)).send({ ids: [ITEM_ID], percent: -50, currency: 'priceCoins' }).expect(200);
    expect(bulk.body.changed).toBe(1);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: ITEM_ID } })).priceCoins).toBe(60);

    const audit = await api().get(`/v1/admin/audit?userId=${userId}`).set(auth(token)).expect(200);
    expect(audit.body.items.map((e: { event: string }) => e.event)).toEqual(expect.arrayContaining(['item_price_change', 'item_price_bulk']));

    await api().patch(`/v1/admin/items/${ITEM_ID}`).set(auth(token)).send({ priceCoins: -5 }).expect(400);
    await api().patch('/v1/admin/items/no_existe').set(auth(token)).send({ priceCoins: 5 }).expect(404);
  });
});
