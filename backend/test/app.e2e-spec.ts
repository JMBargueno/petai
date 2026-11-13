import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('PetAI End-to-End API Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;
  let eggId: string;
  let petId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /v1/catalog — Debe devolver el catálogo completo de juego', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/catalog')
      .expect(200);

    expect(res.body.species).toBeDefined();
    expect(res.body.species.length).toBeGreaterThanOrEqual(3);
    expect(res.body.balance).toBeDefined();
    expect(res.body.foods).toBeDefined();
    expect(res.body.patterns).toBeDefined();
  });

  it('2. POST /v1/auth/register — Registro de nuevo usuario con huevo inicial', async () => {
    const uniqueEmail = `test_${Date.now()}@petai.local`;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail,
        password: 'Password123!',
        displayName: 'TesterPet',
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(uniqueEmail);

    accessToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  it('3. GET /v1/eggs — Debe listar el huevo de bienvenida disponible para eclosionar', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/eggs')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    eggId = res.body[0].id;
  });

  it('4. POST /v1/eggs/:id/hatch — Eclosionar huevo autoritativamente', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/eggs/${eggId}/hatch`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.species).toBeDefined();
    expect(res.body.pattern).toBeDefined();
    expect(res.body.combatStats).toBeDefined();
    expect(res.body.level).toBe(1);
    expect(res.body.hunger).toBe(100);

    petId = res.body.id;
  });

  it('5. GET /v1/pets — Debe retornar la mascota eclosionada del usuario', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(petId);
  });

  it('6. POST /v1/shop/buy — Comprar alimento en la tienda', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/shop/buy')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        itemId: 'apple',
        quantity: 2,
      })
      .expect(201);

    expect(res.body.itemId).toBe('apple');
    expect(res.body.qty).toBe(2);
  });

  it('7. POST /v1/pets/:id/feed — Alimentar a la mascota', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/pets/${petId}/feed`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        itemId: 'apple',
      })
      .expect(201);

    expect(res.body.id).toBe(petId);
    expect(res.body.xp).toBeGreaterThan(0);
  });
});
