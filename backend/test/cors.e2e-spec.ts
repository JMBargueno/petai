import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { applyCors } from '../src/common/cors';

describe('CORS por entorno (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    applyCors(app, 'http://localhost:5173,https://app.petai.example');
    await app.init();
  });
  afterAll(async () => app.close());

  const preflight = (origin: string) =>
    api().options('/v1/me').set('Origin', origin).set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'authorization');

  it('1. un origen permitido recibe las cabeceras CORS en el preflight y en la respuesta', async () => {
    const pre = await preflight('https://app.petai.example');
    expect(pre.headers['access-control-allow-origin']).toBe('https://app.petai.example');
    expect(pre.headers['access-control-allow-headers']).toMatch(/authorization/i);
    expect(pre.headers['access-control-allow-credentials']).toBeUndefined();

    const res = await api().get('/v1/catalog').set('Origin', 'http://localhost:5173').expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('2. un origen no permitido NO recibe Access-Control-Allow-Origin (el navegador lo bloquea)', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:5174', 'null']) {
      const pre = await preflight(origin);
      expect(pre.headers['access-control-allow-origin']).toBeUndefined();
      const res = await api().get('/v1/catalog').set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('3. sin cabecera Origin (curl, apps nativas) la API responde con normalidad', async () => {
    await api().get('/v1/catalog').expect(200);
  });

  it('4. el WebSocket aplica la misma lista (no "*")', async () => {
    const ok = await api().get('/socket.io/?EIO=4&transport=polling').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await api().get('/socket.io/?EIO=4&transport=polling').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
