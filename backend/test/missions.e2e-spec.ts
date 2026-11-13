import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Missions E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;

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
    // Clean up test data (delete in FK dependency order)
    await prisma.mission.deleteMany({ where: { userId } });
    await prisma.battle.deleteMany({
      where: { OR: [{ attackerPet: { userId } }, { defenderPet: { userId } }] },
    });
    await prisma.pet.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  /** Helper: register + login to get a token */
  async function auth(): Promise<{ token: string; userId: string }> {
    const email = `test_${Date.now()}@example.com`;
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

  /** Helper: hatch the first available egg to create a pet */
  async function hatchPet(token: string): Promise<void> {
    const eggs = await request(app.getHttpServer())
      .get('/v1/eggs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/eggs/${eggs.body[0].id}/hatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  }

  it('GET /missions without token returns 401', async () => {
    await request(app.getHttpServer()).get('/v1/missions').expect(401);
  });

  it('GET /missions with valid token returns 200 with daily and weekly', async () => {
    const { token } = await auth();
    // Create a pet so missions make sense
    await hatchPet(token);
    // Get missions (triggers lazy init)
    const res = await request(app.getHttpServer())
      .get('/v1/missions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.timestamp).toBeDefined();
    expect(Array.isArray(res.body.daily)).toBe(true);
    expect(res.body.daily.length).toBeGreaterThanOrEqual(3);
    expect(res.body.daily.length).toBeLessThanOrEqual(5);
    expect(Array.isArray(res.body.weekly)).toBe(true);
    expect(res.body.weekly.length).toBeGreaterThanOrEqual(5);
    expect(res.body.weekly.length).toBeLessThanOrEqual(7);
    expect(res.body.dailyChestUnlocked).toBe(false);
    // Each mission has the required fields
    for (const m of res.body.daily) {
      expect(m.id).toBeDefined();
      expect(m.type).toBeDefined();
      expect(m.description).toBeDefined();
      expect(m.target).toBeGreaterThan(0);
      expect(m.current).toBeGreaterThanOrEqual(0);
      expect(m.completed).toBe(false);
      expect(m.reward).toBeDefined();
      expect(m.resetsAt).toBeDefined();
    }
  });

  it('GET /missions/summary returns progress and streaks', async () => {
    const { token } = await auth();
    await hatchPet(token);
    const res = await request(app.getHttpServer())
      .get('/v1/missions/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.dailyCompleted).toBe(0);
    expect(res.body.dailyTotal).toBeGreaterThanOrEqual(3);
    expect(res.body.weeklyTotal).toBeGreaterThanOrEqual(5);
    expect(res.body.streak).toBeDefined();
    expect(res.body.bestStreak).toBeDefined();
  });

  it('GET /missions/:id returns 404 for invalid mission id', async () => {
    const { token } = await auth();
    await hatchPet(token);
    await request(app.getHttpServer()).get('/v1/missions').set('Authorization', `Bearer ${token}`).expect(200);
    const res = await request(app.getHttpServer())
      .get('/v1/missions/non-existent-id')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(res.body.message).toBeDefined();
  });

  it('POST /missions/:id/claim on incomplete mission returns 400', async () => {
    const { token } = await auth();
    await hatchPet(token);
    const missionsRes = await request(app.getHttpServer()).get('/v1/missions').set('Authorization', `Bearer ${token}`).expect(200);
    const mission = missionsRes.body.daily[0];
    const res = await request(app.getHttpServer())
      .post(`/v1/missions/${mission.id}/claim`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.message).toBeDefined();
  });

  it('POST /missions/:id/claim on non-existent mission returns 404', async () => {
    const { token } = await auth();
    const res = await request(app.getHttpServer())
      .post('/v1/missions/fake-id/claim')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(res.body.message).toBeDefined();
  });
});
