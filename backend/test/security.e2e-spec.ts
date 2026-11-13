import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Seguridad: asignación masiva y validación de perfil (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let petId: string;
  let userId: string;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    const reg = await api().post('/v1/auth/register')
      .send({ email: `sec_${Date.now()}@petai.local`, password: 'Password123!' }).expect(201);
    auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const eggs = await api().get('/v1/eggs').set(auth).expect(200);
    petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201)).body.id;
    userId = (await api().get('/v1/me').set(auth).expect(200)).body.id;
  });
  afterAll(async () => app.close());

  it('PATCH /me ignora campos no permitidos (coins, gems, passwordHash, email…)', async () => {
    const before = (await api().get('/v1/me').set(auth).expect(200)).body;
    const res = await api().patch('/v1/me').set(auth)
      .send({ coins: 999999, gems: 999999, accountXp: 999999, email: 'x@x.io', passwordHash: 'x', id: 'otro' })
      .expect(200);
    expect(res.body.coins).toBe(before.coins);
    expect(res.body.gems).toBe(before.gems);
    expect(res.body.accountXp).toBe(before.accountXp);
    expect(res.body.email).toBe(before.email);
    expect(res.body.id).toBe(userId);

    const row = await app.get(PrismaService).user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.passwordHash).not.toBe('x');
  });

  it('PATCH /me no permite mezclar campos válidos con maliciosos', async () => {
    const before = (await api().get('/v1/me').set(auth)).body.coins;
    const res = await api().patch('/v1/me').set(auth).send({ displayName: 'Ana', coins: 5000 }).expect(200);
    expect(res.body.displayName).toBe('Ana');
    expect(res.body.coins).toBe(before);
  });

  it('valida displayName y timezone', async () => {
    await api().patch('/v1/me').set(auth).send({ displayName: '' }).expect(400);
    await api().patch('/v1/me').set(auth).send({ displayName: 'x'.repeat(51) }).expect(400);
    await api().patch('/v1/me').set(auth).send({ displayName: 123 }).expect(400);
    await api().patch('/v1/me').set(auth).send({ timezone: 'Marte/Olympus' }).expect(400);
    await api().patch('/v1/me').set(auth).send({ timezone: 42 }).expect(400);
    const ok = await api().patch('/v1/me').set(auth).send({ timezone: 'Europe/Madrid' }).expect(200);
    expect(ok.body.timezone).toBe('Europe/Madrid');
  });

  it('PATCH /pets/:id solo acepta apodo y estrategia válidos', async () => {
    await api().patch(`/v1/pets/${petId}`).set(auth).send({ nickname: 'x'.repeat(31) }).expect(400);
    await api().patch(`/v1/pets/${petId}`).set(auth).send({ nickname: '   ' }).expect(400);
    await api().patch(`/v1/pets/${petId}`).set(auth).send({ strategy: 'invencible' }).expect(400);
    const res = await api().patch(`/v1/pets/${petId}`).set(auth)
      .send({ nickname: 'Chispa', strategy: 'defensive', level: 100, intelligence: 1000, userId: 'otro' })
      .expect(200);
    expect(res.body).toMatchObject({ nickname: 'Chispa', strategy: 'defensive' });
    expect(res.body.level).toBeLessThan(100);
    expect(res.body.intelligence).toBe(0);
    expect(res.body.userId).toBe(userId);
  });
});
