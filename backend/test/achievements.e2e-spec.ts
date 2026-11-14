import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E del sistema de logros y constelación (feature 008): registro → pet → feed → progreso →
 * desbloqueo → claim → constelación → visibilidad pública → perfil público.
 */
describe('Achievements E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (!userId) return;
    await prisma.achievement.deleteMany({ where: { userId } });
    await prisma.inventoryItem.deleteMany({ where: { userId } });
    await prisma.pet.deleteMany({ where: { userId } });
    await prisma.egg.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    userId = '';
    petId = '';
  });

  async function auth(): Promise<{ token: string; userId: string }> {
    const email = `ach_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`;
    const regRes = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'SecurePass123!', timezone: 'UTC' })
      .expect(201);
    userId = regRes.body.user?.id ?? regRes.body.id ?? '';
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'SecurePass123!' })
      .expect(200);
    token = loginRes.body.accessToken ?? loginRes.body.access_token;
    return { token, userId };
  }

  async function ensurePet(): Promise<string> {
    if (petId) return petId;
    const pets = await request(app.getHttpServer())
      .get('/v1/pets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    if (Array.isArray(pets.body) && pets.body.length > 0) {
      petId = pets.body[0].id;
      return petId;
    }
    const eggs = await request(app.getHttpServer())
      .get('/v1/eggs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/eggs/${eggs.body[0].id}/hatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const pets2 = await request(app.getHttpServer())
      .get('/v1/pets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    petId = pets2.body[0].id;
    return petId;
  }

  /** Espera (polling) a que el progreso de un logro persista (el tracking es fire-and-forget). */
  async function waitForAchievement(id: string, predicate: (a: any) => boolean, tries = 20): Promise<any> {
    for (let i = 0; i < tries; i++) {
      const res = await request(app.getHttpServer())
        .get('/v1/achievements')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const a = Object.values(res.body.categories ?? {}).flatMap((c: any[]) => c).find((x: any) => x.id === id);
      if (a && predicate(a)) return a;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`El logro ${id} no alcanzó el estado esperado a tiempo`);
  }

  it('GET /achievements without token returns 401', async () => {
    await request(app.getHttpServer()).get('/v1/achievements').expect(401);
  });

  it('GET /achievements with token returns 200 with the 5 categories', async () => {
    await auth();
    const res = await request(app.getHttpServer())
      .get('/v1/achievements')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.timestamp).toEqual(expect.any(String));
    expect(res.body.achievementsPublic).toBe(false);
    for (const cat of ['care', 'battle', 'ai', 'collection', 'social']) {
      expect(Array.isArray(res.body.categories[cat])).toBe(true);
    }
    const all = Object.values(res.body.categories as Record<string, any[]>).flatMap((c) => c);
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(['locked', 'in_progress', 'unlocked']).toContain(a.status);
      expect(a.id).toBeDefined();
      expect(a.target).toBeDefined();
    }
  });

  it('feeding advances care logros and unlocks care_feed_10 at target', async () => {
    await auth();
    await ensurePet();

    // Seed food items in the user's inventory (10 apples)
    await prisma.inventoryItem.create({
      data: { userId, itemId: 'apple', qty: 10 },
    });

    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post(`/v1/pets/${petId}/feed`)
        .set('Authorization', `Bearer ${token}`)
        .send({ itemId: 'apple' })
        .expect(201);
    }

    const unlocked = await waitForAchievement('care_feed_10', (a) => a.status === 'unlocked');
    expect(unlocked.status).toBe('unlocked');

    await request(app.getHttpServer())
      .post('/v1/achievements/care_feed_10/claim')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const claimed = await waitForAchievement('care_feed_10', (a) => a.claimed === true);
    expect(claimed.claimed).toBe(true);
    expect(claimed.unlockedAt).toEqual(expect.any(String));
  });

  it('GET /achievements/constellation/:cat returns a layout; invalid cat returns 400', async () => {
    await auth();
    const ok = await request(app.getHttpServer())
      .get('/v1/achievements/constellation/battle')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ok.body.category).toBe('battle');
    expect(Array.isArray(ok.body.stars)).toBe(true);
    expect(Array.isArray(ok.body.connections)).toBe(true);
    for (const s of ok.body.stars) {
      expect(['locked', 'in_progress', 'unlocked']).toContain(s.status);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
    }

    await request(app.getHttpServer())
      .get('/v1/achievements/constellation/whatever')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('PATCH /me achievementsPublic=true exposes only unlocked logros via the public endpoint', async () => {
    await auth();
    await ensurePet();

    // Seed food items in the user's inventory (10 apples)
    await prisma.inventoryItem.create({
      data: { userId, itemId: 'apple', qty: 10 },
    });

    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post(`/v1/pets/${petId}/feed`)
        .set('Authorization', `Bearer ${token}`)
        .send({ itemId: 'apple' })
        .expect(201);
    }
    await waitForAchievement('care_feed_10', (a) => a.status === 'unlocked');

    const privateRes = await request(app.getHttpServer())
      .get(`/v1/users/${userId}/achievements`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(privateRes.body.achievementsPublic).toBe(false);
    expect(privateRes.body.achievements).toEqual([]);

    await request(app.getHttpServer())
      .patch('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ achievementsPublic: true })
      .expect(200);

    const publicRes = await request(app.getHttpServer())
      .get(`/v1/users/${userId}/achievements?public=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(publicRes.body.achievementsPublic).toBe(true);
    const unlockedIds = publicRes.body.achievements.map((a: any) => a.id);
    expect(unlockedIds).toContain('care_feed_10');
    for (const a of publicRes.body.achievements) {
      expect(a).not.toHaveProperty('current');
    }
  });
});
