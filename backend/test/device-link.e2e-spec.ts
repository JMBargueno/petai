import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Vinculación de dispositivos (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const email = `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    const res = await api().post('/v1/auth/register').send({ email, password: 'Contrasena-Segura-123' }).expect(201);
    token = res.body.accessToken;
  });
  afterAll(async () => app.close());

  it('flujo completo: start → pending → confirm → confirmed (un solo uso)', async () => {
    const start = await api().post('/v1/auth/device/start').expect(200);
    expect(start.body.code).toMatch(/^\d{6}$/);
    const { code, pollToken } = start.body;

    expect((await api().post('/v1/auth/device/poll').send({ pollToken }).expect(200)).body.status).toBe('pending');

    await api().post('/v1/auth/device/confirm').send({ code }).expect(401); // sin sesión
    await api().post('/v1/auth/device/confirm').set('Authorization', `Bearer ${token}`).send({ code }).expect(200);

    const done = await api().post('/v1/auth/device/poll').send({ pollToken }).expect(200);
    expect(done.body.status).toBe('confirmed');
    expect(done.body.user.email).toBe(email);
    const me = await api().get('/v1/me').set('Authorization', `Bearer ${done.body.accessToken}`).expect(200);
    expect(me.body.email).toBe(email);

    // El token de sondeo ya no sirve
    await api().post('/v1/auth/device/poll').send({ pollToken }).expect(404);
  });

  it('rechaza códigos mal formados o inexistentes', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await api().post('/v1/auth/device/confirm').set(auth).send({ code: '12ab56' }).expect(400);
    await api().post('/v1/auth/device/confirm').set(auth).send({}).expect(400);
    await api().post('/v1/auth/device/confirm').set(auth).send({ code: '000000' }).expect(404);
    await api().post('/v1/auth/device/poll').send({ pollToken: 'x' }).expect(400);
    await api().post('/v1/auth/device/poll').send({ pollToken: 'a'.repeat(48) }).expect(404);
  });

  it('un código ya canjeado no se puede reutilizar', async () => {
    const { code, pollToken } = (await api().post('/v1/auth/device/start').expect(200)).body;
    const auth = { Authorization: `Bearer ${token}` };
    await api().post('/v1/auth/device/confirm').set(auth).send({ code }).expect(200);
    await api().post('/v1/auth/device/poll').send({ pollToken }).expect(200);
    await api().post('/v1/auth/device/confirm').set(auth).send({ code }).expect(404);
  });
});
