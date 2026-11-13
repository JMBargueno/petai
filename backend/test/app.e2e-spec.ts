import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

  // ---------- Fase 2 ----------
  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const http = () => request(app.getHttpServer());

  it('8. POST /v1/shop/buy — valida cantidad e itemId', async () => {
    for (const body of [{ itemId: 'apple', quantity: 0 }, { itemId: 'apple', quantity: 1.5 },
      { itemId: 'apple', quantity: 1000 }, { quantity: 1 }]) {
      await http().post('/v1/shop/buy').set(auth()).send(body).expect(400);
    }
  });

  it('9. GET /v1/shop?kind= — Filtra por tipo y expone la piedra de evolución', async () => {
    const res = await http().get('/v1/shop?kind=evolution').expect(200);
    expect(res.body.map((i: any) => i.id)).toContain('evolution_stone');
    expect(res.body.every((i: any) => i.kind === 'evolution')).toBe(true);
  });

  it('10. Una medicina no se puede usar como comida y no se consume', async () => {
    await http().post('/v1/shop/buy').set(auth()).send({ itemId: 'medicine', quantity: 1 }).expect(201);
    await http().post(`/v1/pets/${petId}/feed`).set(auth()).send({ itemId: 'medicine' }).expect(400);
    const inv = await http().get('/v1/inventory').set(auth()).expect(200);
    expect(inv.body.find((i: any) => i.itemId === 'medicine').qty).toBe(1);
  });

  it('11. POST /v1/pets/:id/evolve — Rechaza la forma final sin nivel/objeto', async () => {
    await http().post(`/v1/pets/${petId}/evolve`).set(auth()).expect(400);
  });

  describe('minijuegos', () => {
    let prisma: PrismaService;
    const backdateAll = (seconds: number) =>
      prisma.minigameSession.updateMany({
        where: { userId },
        data: { startedAt: new Date(Date.now() - seconds * 1000) },
      });

    beforeAll(() => {
      prisma = app.get(PrismaService);
    });

    it('12. Lista los minijuegos y exige petId para empezar', async () => {
      const list = await http().get('/v1/minigames').set(auth()).expect(200);
      expect(list.body.map((g: any) => g.id).sort()).toEqual(['catch_food', 'memory_match', 'reflex']);
      await http().post('/v1/minigames/reflex/start').set(auth()).send({}).expect(400);
      await http().post('/v1/minigames/nope/start').set(auth()).send({ petId }).expect(404);
    });

    it('13. Finalizar al instante se rechaza y quema la sesión; el cooldown aplica', async () => {
      const start = await http().post('/v1/minigames/reflex/start').set(auth()).send({ petId }).expect(201);
      expect(start.body.seed).toBeGreaterThan(0);
      await http().post(`/v1/minigames/sessions/${start.body.sessionId}/finish`)
        .set(auth()).send({ score: 5 }).expect(400);
      await http().post('/v1/minigames/reflex/start').set(auth()).send({ petId }).expect(400); // cooldown
    });

    it('14. Partida válida: recompensa una vez; reenviar o una puntuación imposible fallan', async () => {
      await backdateAll(120);
      const before = (await http().get('/v1/me').set(auth()).expect(200)).body.coins;

      const s = await http().post('/v1/minigames/reflex/start').set(auth()).send({ petId }).expect(201);
      await prisma.minigameSession.update({
        where: { id: s.body.sessionId }, data: { startedAt: new Date(Date.now() - 25_000) } });
      const done = await http().post(`/v1/minigames/sessions/${s.body.sessionId}/finish`)
        .set(auth()).send({ score: 20 }).expect(201);
      expect(done.body.rewards.coins).toBe(12);
      expect(done.body.pet.id).toBe(petId);

      const after = (await http().get('/v1/me').set(auth()).expect(200)).body.coins;
      expect(after - before).toBe(12);

      await http().post(`/v1/minigames/sessions/${s.body.sessionId}/finish`)
        .set(auth()).send({ score: 20 }).expect(400);

      await backdateAll(120);
      const cheat = await http().post('/v1/minigames/reflex/start').set(auth()).send({ petId }).expect(201);
      await prisma.minigameSession.update({
        where: { id: cheat.body.sessionId }, data: { startedAt: new Date(Date.now() - 25_000) } });
      await http().post(`/v1/minigames/sessions/${cheat.body.sessionId}/finish`)
        .set(auth()).send({ score: 9999 }).expect(400);
    });
  });
});
