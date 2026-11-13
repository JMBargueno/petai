import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { applySecurity } from '../src/common/security';

describe('Salud y cabeceras de seguridad (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    applySecurity(app, { swagger: false });
    await app.init();
  });
  afterAll(async () => app.close());

  it('liveness y readiness no requieren sesión', async () => {
    expect((await api().get('/v1/health').expect(200)).body).toMatchObject({ status: 'ok' });
    const ready = await api().get('/v1/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('las respuestas llevan cabeceras de seguridad y no revelan el framework', async () => {
    const res = await api().get('/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
