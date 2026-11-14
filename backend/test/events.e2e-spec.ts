import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de `GET /events/upcoming` (feature 009-edge-cdn, T025).
 * Verifica: 401 sin token; 200 con token; shape `{ windowHours, events[] }` con `assetPrefix`.
 */
describe('Events E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => app.close());

  afterEach(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
  });

  async function auth(): Promise<string> {
    const email = `events_${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'SecurePass123!' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'SecurePass123!' })
      .expect(200);
    const user = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    userId = user.body?.id ?? '';
    return login.body.accessToken;
  }

  it('GET /v1/events/upcoming sin token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/events/upcoming').expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('GET /v1/events/upcoming con token → 200 con la forma del contrato', async () => {
    const t = await auth();
    const res = await request(app.getHttpServer())
      .get('/v1/events/upcoming')
      .set('Authorization', `Bearer ${t}`)
      .expect(200);
    expect(res.body.windowHours).toBe(24);
    expect(Array.isArray(res.body.events)).toBe(true);
    // Cada evento (si los hay) cumple el UpcomingEventDto, incluido `assetPrefix`.
    for (const evt of res.body.events) {
      expect(evt).toHaveProperty('id');
      expect(evt).toHaveProperty('name');
      expect(evt).toHaveProperty('type');
      expect(typeof evt.startsAt).toBe('string');
      expect(evt.assetPrefix === null || typeof evt.assetPrefix === 'string').toBe(true);
      if (typeof evt.assetPrefix === 'string') expect(evt.assetPrefix).toMatch(/^event\//);
    }
  });
});