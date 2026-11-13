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

  it('health y readiness no requieren sesión y exponen sub-checks por componente (FR-007)', async () => {
    const health = await api().get('/v1/health').expect(200);
    expect(['ok', 'degraded']).toContain(health.body.status);
    expect(health.body.version).toBe('0.1.0');
    expect(typeof health.body.uptime).toBe('number');
    // FR-007: sub-checks por componente. `db` es crítico y debe estar ok (PostgreSQL up en el test).
    expect(health.body.checks).toMatchObject({ db: { status: 'ok' } });
    expect(typeof health.body.checks.db.latency_ms).toBe('number');
    expect(health.body.checks).toHaveProperty('redis');
    expect(health.body.checks).toHaveProperty('bullmq');
    expect(health.body.checks.bullmq.active_workers).toBe(0);

    const ready = await api().get('/v1/health/ready').expect(200);
    expect(['ok', 'degraded']).toContain(ready.body.status);
    expect(ready.body.checks).toMatchObject({ db: { status: 'ok' } });
  });

  it('las respuestas llevan cabeceras de seguridad y no revelan el framework', async () => {
    const res = await api().get('/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
