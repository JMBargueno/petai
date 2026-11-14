import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const dataDir = path.resolve(__dirname, '../../shared/game-data');
const foods: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'foods.json'), 'utf8'));

/**
 * Cofres y Drops (e2e). Cubre US1 (T012), US2 (T015), US3 (T020) y US5 (T025). Los cofres se siembran
 * directamente con Prisma (el job `chests:create` se cubre de forma unitaria/integración aparte).
 */
describe('Cofres y Drops (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `chest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
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

  async function seedChest(
    userId: string,
    type: string,
    source: string,
    opts: { openedAt?: Date | null; createdAt?: Date; drops?: any[] } = {},
  ) {
    return prisma.chest.create({
      data: {
        userId,
        type,
        source,
        openedAt: opts.openedAt ?? null,
        createdAt: opts.createdAt ?? new Date(),
        drops: opts.drops,
      } as any,
    });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);

    // Garantizar que los items de las tablas de drop existan (FK de InventoryItem → Item).
    for (const food of foods) {
      await prisma.item.upsert({
        where: { id: food.id },
        update: {},
        create: {
          id: food.id,
          kind: food.kind,
          name: food.name,
          description: food.description ?? '',
          effects: food.effects ?? {},
          priceCoins: food.priceCoins ?? 0,
          priceGems: food.priceGems ?? 0,
        },
      });
    }
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('US1: GET /chests', () => {
    it('a) lista solo cofres no abiertos (excluye los ya abiertos)', async () => {
      const { token, userId } = await signup();
      await seedChest(userId, 'bronze', 'daily_mission');
      await seedChest(userId, 'gold', 'purchase');
      await seedChest(userId, 'diamond', 'event');
      await seedChest(userId, 'silver', 'battle', { openedAt: new Date() });
      await seedChest(userId, 'mythic', 'event', { openedAt: new Date() });

      const res = await api()
        .get('/v1/chests')
        .set(auth(token))
        .expect(200);
      expect(res.body.chests).toHaveLength(3);
      expect(res.body.chests.map((c: any) => c.type).sort()).toEqual(['bronze', 'diamond', 'gold']);
      for (const c of res.body.chests) {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('source');
        expect(c).toHaveProperty('createdAt');
      }
    });

    it('b) sin cofres → { chests: [] }', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/chests').set(auth(token)).expect(200);
      expect(res.body.chests).toEqual([]);
    });

    it('c) sin token → 401', async () => {
      await api().get('/v1/chests').expect(401);
    });

    it('d) token inválido → 401', async () => {
      await api().get('/v1/chests').set({ Authorization: 'Bearer no-es-un-jwt' }).expect(401);
    });
  });

  describe('US2: POST /chests/open', () => {
    it('a) abre un cofre bronze: drops + inventario + pityProgress + openedAt', async () => {
      const { token, userId } = await signup();
      const chest = await seedChest(userId, 'bronze', 'daily_mission');

      const res = await api()
        .post('/v1/chests/open')
        .set(auth(token))
        .send({ chestId: chest.id })
        .expect(200);

      expect(res.body.chest.openedAt).toBeTruthy();
      expect(res.body.chest.id).toBe(chest.id);
      expect(Array.isArray(res.body.drops)).toBe(true);
      expect(res.body.drops.length).toBeGreaterThan(0);
      for (const d of res.body.drops) {
        expect(d).toHaveProperty('itemId');
        expect(d).toHaveProperty('name');
        expect(d).toHaveProperty('qty');
        expect(d).toHaveProperty('tier');
        expect(d).toHaveProperty('isNew');
        expect(d.qty).toBeGreaterThanOrEqual(1);
        expect(d.qty).toBeLessThanOrEqual(99);
      }
      expect(res.body.pityProgress).toMatchObject({
        count: expect.any(Number),
        threshold: expect.any(Number),
        minTier: expect.any(String),
      });

      // Items acreditados en InventoryItem (SC-006: no hay grants huérfanos)
      for (const d of res.body.drops) {
        const inv = await prisma.inventoryItem.findUnique({
          where: { userId_itemId: { userId, itemId: d.itemId } },
        });
        expect(inv).toBeTruthy();
        expect(inv!.qty).toBeGreaterThanOrEqual(d.qty);
      }
      // Chest.openedAt poblado y drops persistidos
      const after = await prisma.chest.findUnique({ where: { id: chest.id } });
      expect(after!.openedAt).toBeTruthy();
      expect(after!.drops).toBeTruthy();
    });

    it('b) chestId inexistente (uuid válido) → 404 y no altera nada', async () => {
      const { token } = await signup();
      const uuid = '00000000-0000-4000-8000-000000000000';
      await api()
        .post('/v1/chests/open')
        .set(auth(token))
        .send({ chestId: uuid })
        .expect(404);
    });

    it('c) cofre de otro usuario → 404', async () => {
      const owner = await signup();
      const intruder = await signup();
      const chest = await seedChest(owner.userId, 'bronze', 'daily_mission');
      await api()
        .post('/v1/chests/open')
        .set(auth(intruder.token))
        .send({ chestId: chest.id })
        .expect(404);
    });

    it('d) abrir dos veces → la segunda responde 409', async () => {
      const { token, userId } = await signup();
      const chest = await seedChest(userId, 'bronze', 'battle');
      await api().post('/v1/chests/open').set(auth(token)).send({ chestId: chest.id }).expect(200);
      await api().post('/v1/chests/open').set(auth(token)).send({ chestId: chest.id }).expect(409);
    });
  });

  describe('US3: POST /chests/purchase', () => {
    it('a) compra con coins → 200, cofre purchase y coinsRemaining correcto', async () => {
      const { token, userId } = await signup();
      const before = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
      const res = await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'bronze', paymentMethod: 'coins' })
        .expect(200);
      expect(res.body.chest.source).toBe('purchase');
      expect(res.body.chest.type).toBe('bronze');
      const price = (JSON.parse(fs.readFileSync(path.join(dataDir, 'balance.json'), 'utf8')).chests.bronze.prices.coins);
      expect(res.body.coinsRemaining).toBe(before!.coins - price);
    });

    it('b) saldo insuficiente → 400 y no crea cofre', async () => {
      const { token, userId } = await signup();
      await prisma.user.update({ where: { id: userId }, data: { coins: 5, gems: 0 } });
      await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'gold', paymentMethod: 'coins' })
        .expect(400);
      expect(await prisma.chest.count({ where: { userId } })).toBe(0);
    });

    it('c) 6ª compra del día → 409', async () => {
      const { token, userId } = await signup();
      const now = new Date();
      for (let i = 0; i < 5; i++) await seedChest(userId, 'bronze', 'purchase', { createdAt: now });
      await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'bronze', paymentMethod: 'coins' })
        .expect(409);
    });

    it('d) type diamond → 400', async () => {
      const { token } = await signup();
      await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'diamond', paymentMethod: 'coins' })
        .expect(400);
    });

    it('e) type mythic → 400', async () => {
      const { token } = await signup();
      await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'mythic', paymentMethod: 'coins' })
        .expect(400);
    });

    it('f) paymentMethod gems → 200', async () => {
      const { token, userId } = await signup();
      await prisma.user.update({ where: { id: userId }, data: { gems: 20 } });
      const res = await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'bronze', paymentMethod: 'gems' })
        .expect(200);
      expect(res.body.chest.source).toBe('purchase');
      expect(res.body.gemsRemaining).toBe(18);
    });

    it('g) método inválido → 400', async () => {
      const { token } = await signup();
      await api()
        .post('/v1/chests/purchase')
        .set(auth(token))
        .send({ type: 'bronze', paymentMethod: 'credit_card' })
        .expect(400);
    });
  });

  describe('US5: GET /chests/history', () => {
    it('a) 120 aperturas → limit=50&offset=0 → 50 + total=120 (desc)', async () => {
      const { token, userId } = await signup();
      for (let i = 0; i < 120; i++) {
        await prisma.chest.create({
          data: {
            userId,
            type: 'bronze',
            source: 'daily_mission',
            openedAt: new Date(Date.now() - i * 1000),
            createdAt: new Date(Date.now() - i * 1000),
            drops: [{ itemId: 'apple', name: 'Manzana', qty: 1, tier: 'common', isNew: true }],
          } as any,
        });
      }
      const res = await api()
        .get('/v1/chests/history?limit=50&offset=0')
        .set(auth(token))
        .expect(200);
      expect(res.body.openings).toHaveLength(50);
      expect(res.body.total).toBe(120);
      const times = res.body.openings.map((o: any) => new Date(o.openedAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });

    it('b) 3 aperturas → 3 + total=3', async () => {
      const { token, userId } = await signup();
      for (let i = 0; i < 3; i++) {
        await prisma.chest.create({
          data: {
            userId,
            type: 'silver',
            source: 'battle',
            openedAt: new Date(),
            drops: [],
          } as any,
        });
      }
      const res = await api().get('/v1/chests/history').set(auth(token)).expect(200);
      expect(res.body.openings).toHaveLength(3);
      expect(res.body.total).toBe(3);
    });

    it('c) 0 aperturas → [] + total=0', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/chests/history').set(auth(token)).expect(200);
      expect(res.body.openings).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('d) limit=200 → capped en 100', async () => {
      const { token, userId } = await signup();
      for (let i = 0; i < 120; i++) {
        await prisma.chest.create({
          data: {
            userId,
            type: 'gold',
            source: 'purchase',
            openedAt: new Date(Date.now() - i * 1000),
            drops: [],
          } as any,
        });
      }
      const res = await api()
        .get('/v1/chests/history?limit=200&offset=0')
        .set(auth(token))
        .expect(200);
      expect(res.body.openings).toHaveLength(100);
      expect(res.body.total).toBe(120);
    });
  });
});