import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Catálogo real de items (la fuente de `prisma.item`). La semilla del seed job
// (backend/prisma/seed.ts) crea estos items a partir de foods.json; los resembramos
// aquí para que la FK de InventoryItem → Item no dependa del estado previo de la BD.
const dataDir = path.resolve(__dirname, '../../shared/game-data');
const foods: any[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'foods.json'), 'utf8'));

/**
 * Inventory & Shop — happy-path (e2e).
 *
 * El controller `inventory.controller.ts` usa `@Controller()` (prefijo VACÍO), por lo que con
 * el prefijo global `v1` las rutas son ABSOLUTAS:
 *   GET  /v1/shop        → pública, SIN guard (getShopItems → item.findMany)
 *   GET  /v1/inventory   → JwtAuthGuard (getInventory → inventoryItem.findMany qty>0, include item)
 *   POST /v1/shop/buy    → JwtAuthGuard (buyItem → cobro atómico monedas+gemas + upsert InventoryItem)
 *
 * PRECONDICIONES REALES leídas (no adivinadas):
 *  · auth.service.ts:60-61  → al registrar el usuario nace con coins=100, gems=10.
 *  · foods.json             → `apple` (kind food, priceCoins=10, priceGems=0) y
 *                             `medicine` (kind medicine, priceCoins=80, priceGems=1).
 *  · inventory.service.ts   → MAX_PURCHASE_QTY=99; quantity entero en [1,99];
 *                             cobro atómico (updateMany condicional) + upsert InventoryItem.
 *
 * Cada prueba usa un usuario fresco para no acoplar saldos entre tests.
 */
describe('Inventory & Shop — happy path (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdUsers: string[] = [];

  // Item real del catálogo con precio solo en monedas (para probar el cobro de coins).
  const FOOD = foods.find((f) => f.id === 'apple')!;
  // Item real del catálogo con precio en monedas Y gemas (para cubrir el doble cobro).
  const MED = foods.find((f) => f.id === 'medicine')!;

  type U = { token: string; userId: string; auth: Record<string, string> };

  /** Helper: POST /v1/auth/register → 201 (el usuario nace con coins=100, gems=10). */
  async function makeUser(): Promise<U> {
    const email = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Inv Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const userId = reg.body.user.id as string;
    createdUsers.push(userId);
    return { token, userId, auth: auth(token) };
  }

  const userBalance = async (userId: string) =>
    prisma.user.findUnique({ where: { id: userId } });

  const invRow = async (userId: string, itemId: string) =>
    prisma.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId } } });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);

    // Garantiza que los items del catálogo existan (FK de InventoryItem → Item).
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

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/shop — pública (sin guard): lista el catálogo de items.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/shop', () => {
    it('sin token (ruta pública) → 200 y lista el catálogo con los items reales', async () => {
      const res = await api().get('/v1/shop').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const apple = res.body.find((i: any) => i.id === 'apple');
      expect(apple).toBeDefined();
      expect(apple.kind).toBe(FOOD.kind); // 'food'
      expect(apple.priceCoins).toBe(FOOD.priceCoins); // 10
    });

    it('filtro ?kind=food → solo items de ese tipo', async () => {
      const all = await api().get('/v1/shop').expect(200);
      const res = await api().get('/v1/shop?kind=food').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.length).toBeLessThanOrEqual(all.body.length);
      for (const item of res.body) {
        expect(item.kind).toBe('food');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/inventory — JwtAuthGuard: inventario del usuario (solo qty > 0).
  // ─────────────────────────────────────────────────────────────────────────────
  describe('GET /v1/inventory', () => {
    it('usuario recién registrado sin compras → 200 y []', async () => {
      const u = await makeUser();
      const res = await api().get('/v1/inventory').set(u.auth).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('tras comprar, devuelve la fila con qty y el item embebido', async () => {
      const u = await makeUser();
      // Compra 2 manzanas (item real `apple`, 10 coins c/u) vía la propia API.
      await api()
        .post('/v1/shop/buy')
        .set(u.auth)
        .send({ itemId: 'apple', quantity: 2 })
        .expect(201);

      const res = await api().get('/v1/inventory').set(u.auth).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ itemId: 'apple', qty: 2 });
      expect(res.body[0].item).toMatchObject({ id: 'apple', kind: 'food' });
    });
  });
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/shop/buy — JwtAuthGuard: compra atómica (cobra y acredita inventario).
  // ─────────────────────────────────────────────────────────────────────────────
  describe('POST /v1/shop/buy', () => {
    it('compra de comida (solo monedas) → 201, cobra el total y acredita qty', async () => {
      const u = await makeUser();
      const before = await userBalance(u.userId);
      expect(before!.coins).toBe(100); // saldo inicial del registro

      const res = await api()
        .post('/v1/shop/buy')
        .set(u.auth)
        .send({ itemId: 'apple', quantity: 2 })
        .expect(201);
      expect(res.body.itemId).toBe('apple');
      expect(res.body.qty).toBe(2);

      const after = await userBalance(u.userId);
      // apple = 10 coins c/u → -20 monedas, 0 gemas.
      expect(after!.coins).toBe(before!.coins - FOOD.priceCoins * 2);
      expect(after!.gems).toBe(before!.gems);

      const row = await invRow(u.userId, 'apple');
      expect(row).toMatchObject({ itemId: 'apple', qty: 2 });
    });

    it('compra con doble moneda (medicina) → 201, cobra monedas Y gemas', async () => {
      const u = await makeUser();
      const before = await userBalance(u.userId);

      const res = await api()
        .post('/v1/shop/buy')
        .set(u.auth)
        .send({ itemId: 'medicine', quantity: 1 })
        .expect(201);
      expect(res.body.itemId).toBe('medicine');
      expect(res.body.qty).toBe(1);

      const after = await userBalance(u.userId);
      // medicine = 80 coins + 1 gem → saldo inicial (100,10) → (20,9).
      expect(after!.coins).toBe(before!.coins - MED.priceCoins);
      expect(after!.gems).toBe(before!.gems - MED.priceGems);

      const row = await invRow(u.userId, 'medicine');
      expect(row).toMatchObject({ itemId: 'medicine', qty: 1 });
    });

    it('compra repetida del mismo item → incrementa la fila (no la duplica)', async () => {
      const u = await makeUser();
      await api()
        .post('/v1/shop/buy')
        .set(u.auth)
        .send({ itemId: 'apple', quantity: 3 })
        .expect(201);
      await api()
        .post('/v1/shop/buy')
        .set(u.auth)
        .send({ itemId: 'apple', quantity: 2 })
        .expect(201);

      // Una sola fila (userId,itemId) con cantidad acumulada 3+2=5.
      const rows = await prisma.inventoryItem.findMany({
        where: { userId: u.userId, itemId: 'apple' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].qty).toBe(5);

      const after = await userBalance(u.userId);
      expect(after!.coins).toBe(100 - FOOD.priceCoins * 5); // 50
    });
  });
});


