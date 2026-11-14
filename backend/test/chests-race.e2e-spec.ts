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
 * Race-condition de apertura (SC-004, T016): dos `POST /chests/open` simultáneos al mismo cofre
 * deben producir exactamente una apertura exitosa (200) y la otra 409, sin duplicar drops.
 */
describe('Cofres: race-condition de apertura (SC-004, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  let userId = '';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);

    // Garantizar los items del catálogo (FK de InventoryItem → Item).
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
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
  });

  it('dos aperturas simultáneas: una 200 + una 409, sin drops duplicados', async () => {
    const email = `race_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await api().get('/v1/me').set(auth(token)).expect(200);
    userId = me.body.id as string;

    const chest = await prisma.chest.create({
      data: { userId, type: 'bronze', source: 'battle' },
    });

    const [r1, r2] = await Promise.all([
      api().post('/v1/chests/open').set(auth(token)).send({ chestId: chest.id }),
      api().post('/v1/chests/open').set(auth(token)).send({ chestId: chest.id }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 409]);

    const after = await prisma.chest.findUnique({ where: { id: chest.id } });
    expect(after!.openedAt).toBeTruthy();

    // Los drops del cofre ganador deben coincidir 1:1 con el inventario (sin duplicación).
    const winner = r1.status === 200 ? r1.body : r2.body;
    const dropsByItem: Record<string, number> = {};
    for (const d of winner.drops) dropsByItem[d.itemId] = (dropsByItem[d.itemId] ?? 0) + d.qty;
    const inv = await prisma.inventoryItem.findMany({ where: { userId } });
    for (const [itemId, qty] of Object.entries(dropsByItem)) {
      const row = inv.find((i) => i.itemId === itemId);
      expect(row).toBeTruthy();
      expect(row!.qty).toBe(qty);
    }
  });
});