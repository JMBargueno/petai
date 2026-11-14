import { ConfigService } from '@nestjs/config';
import { MetricsService, METRIC_NAMES } from './metrics.service';

/**
 * Tests del servicio de métricas (T041, US1). Verifican que las 8 métricas del contrato
 * están registradas, que el gauge de conexiones se semilla a 0 y que `recordHttp` alimenta el
 * histograma. El servidor HTTP se levanta en un puerto efímero (0).
 */
describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    const config = new ConfigService({ METRICS_PORT: 0, NODE_ENV: 'test' });
    service = new MetricsService(config);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('registra las 8 métricas del contrato', async () => {
    service.onModuleInit();
    const names = await service.getMetricNames();
    for (const metric of METRIC_NAMES) {
      expect(names).toContain(metric);
    }
  });

  it('semilla el gauge de conexiones Socket.IO a 0', () => {
    service.onModuleInit();
    expect(service.getSocketConnections()).toBe(0);
  });

  it('recordHttp observa el histograma sin lanzar', () => {
    service.onModuleInit();
    expect(() => service.recordHttp('GET', '/v1/pets', 200, 0.04)).not.toThrow();
  });

  it('expone /metrics en formato Prometheus tras tráfico', async () => {
    service.onModuleInit();
    service.recordHttp('GET', '/v1/pets', 200, 0.04);
    service.socketioConnections.set(2);
    const port = await service.whenListening();
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('petai_http_request_duration_seconds_bucket');
    expect(body).toContain('petai_socketio_active_connections');
    expect(body).toContain('petai_memory_heap_used_bytes');
  });
});
