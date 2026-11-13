import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { MetricsService, METRIC_NAMES } from '../src/observability/metrics.service';

/** Puerto efímero (0): el servidor de métricas elige un puerto libre y lo leemos de la socket. */
process.env.METRICS_PORT = '0';

/**
 * e2e de observabilidad (T012, T016, T017).
 *
 * Requiere PostgreSQL y Redis (docker-compose). Verifica:
 *  - Las 8 métricas del contrato están registradas.
 *  - `GET /metrics` (9464/19464) responde 200 en formato Prometheus.
 *  - Una request REST alimenta `petai_http_request_duration_seconds`.
 *  - `GET /v1/health/otel` expone el estado del pipeline.
 *  - Una consulta a DB/Redis alimenta sus métricas.
 */
describe('Observabilidad (e2e)', () => {
  let app: INestApplication;
  let metrics: MetricsService;

  beforeAll(async () => {
    // Puerto efímero: evita colisiones con otros specs que levanten su propio servidor de métricas.
    process.env.METRICS_PORT = '0';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    metrics = app.get(MetricsService);
    // El servidor de métricas se levanta de forma asíncrona; le damos un margen.
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Expone las 8 métricas del contrato (US1)', async () => {
    const names = await metrics.getMetricNames();
    for (const metric of METRIC_NAMES) {
      expect(names).toContain(metric);
    }
  });

  it('2. GET /metrics responde 200 en formato Prometheus (US1)', async () => {
    const port = await metrics.whenListening();
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain; version=0.0.4');

    const body = await res.text();
    expect(body).toContain('# HELP petai_memory_heap_used_bytes');
    expect(body).toContain('petai_socketio_active_connections');
    expect(body).toContain('petai_memory_heap_used_bytes');
  });

  it('3. Una request REST alimenta petai_http_request_duration_seconds (US2)', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const port = metrics.getMetricsPort();
    const body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
    expect(body).toContain('petai_http_request_duration_seconds_bucket');
    expect(body).toMatch(/petai_http_request_duration_seconds_count\{[^}]*status="200"[^}]*\}/);
  });

  it('4. GET /v1/health/otel expone el estado del pipeline (US1)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/otel').expect(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(typeof res.body.otel.enabled).toBe('boolean');
    expect(res.body.otel.metrics_exporting).toBe(true);
    expect(typeof res.body.otel.sampling_rate).toBe('number');
    expect(typeof res.body.otel.active_traces_in_buffer).toBe('number');
  });

  it('5. Una consulta a DB/Redis alimenta sus métricas (US2)', async () => {
    await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const port = metrics.getMetricsPort();
    const body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
    expect(body).toContain('petai_db_query_duration_seconds_bucket');
    expect(body).toContain('petai_redis_operation_duration_seconds_bucket');
  });
});
