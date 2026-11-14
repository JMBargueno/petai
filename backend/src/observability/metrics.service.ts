/**
 * Servicio de métricas (prom-client) (T013, T014, T015).
 *
 * Define las 8 métricas del contrato (`contracts/api-contract.md` §1) y las expone en un
 * servidor HTTP dedicado al puerto `METRICS_PORT` (9464 por defecto), AISLADO del servidor
 * principal (3000). El endpoint `GET /metrics` responde en formato Prometheus text exposition
 * (`text/plain; version=0.0.4`).
 *
 * - `petai_memory_heap_used_bytes` y `petai_gc_pause_seconds` se alimentan con collectors
 *   (`process.memoryUsage()` y `PerformanceObserver({ entryTypes: ['gc'] })`).
 * - Usa un `Registry` propio para no colisionar con el registro global de prom-client (importante
 *   cuando Nest se reinicia en tests).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'node:http';
import * as client from 'prom-client';
import { PerformanceObserver } from 'node:perf_hooks';
import {
  DB_DURATION_BUCKETS,
  GC_PAUSE_BUCKETS,
  HTTP_DURATION_BUCKETS,
  OTEL_SERVICE_NAME,
  REDIS_DURATION_BUCKETS,
  SSE_DURATION_BUCKETS,
} from './otel.constants';

/** Nombres de las 8 métricas del contrato (usado por tests y dashboards). */
export const METRIC_NAMES = [
  'petai_http_request_duration_seconds',
  'petai_db_query_duration_seconds',
  'petai_redis_operation_duration_seconds',
  'petai_socketio_active_connections',
  'petai_bullmq_queue_depth',
  'petai_sse_stream_duration_seconds',
  'petai_memory_heap_used_bytes',
  'petai_gc_pause_seconds',
  'petai_cdn_hit_total',
  'petai_cdn_fallback_origin_total',
  'petai_cdn_refresh_ms',
] as const;

const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private readonly register = new client.Registry();
  private server: http.Server | null = null;
  private gcObserver: PerformanceObserver | null = null;
  private socketCount = 0;
  private listeningPromise: Promise<number> | null = null;

  // Histogramas
  readonly httpDuration: client.Histogram;
  readonly dbQueryDuration: client.Histogram;
  readonly redisOpDuration: client.Histogram;
  readonly sseStreamDuration: client.Histogram;
  readonly gcPause: client.Histogram;
  // Gauges
  readonly socketioConnections: client.Gauge;
  readonly bullmqQueueDepth: client.Gauge;
  readonly memoryHeapUsed: client.Gauge;
  // Métricas de CDN (feature 009-edge-cdn, US4): por región.
  readonly cdnHitTotal: client.Counter;
  readonly cdnFallbackOriginTotal: client.Counter;
  readonly cdnRefreshMs: client.Histogram;

  private metricsPort: number;

  constructor(private readonly config: ConfigService) {
    this.metricsPort = this.config.get<number>('METRICS_PORT') ?? 9464;
    this.register.setDefaultLabels({
      service: OTEL_SERVICE_NAME,
      env: this.config.get<string>('NODE_ENV') ?? 'development',
    });

    this.httpDuration = new client.Histogram({
      name: 'petai_http_request_duration_seconds',
      help: 'Latencia de requests HTTP (segundos)',
      labelNames: ['method', 'route', 'status'],
      buckets: [...HTTP_DURATION_BUCKETS],
      registers: [this.register],
    });
    this.dbQueryDuration = new client.Histogram({
      name: 'petai_db_query_duration_seconds',
      help: 'Duración de consultas a PostgreSQL (segundos)',
      buckets: [...DB_DURATION_BUCKETS],
      registers: [this.register],
    });
    this.redisOpDuration = new client.Histogram({
      name: 'petai_redis_operation_duration_seconds',
      help: 'Duración de operaciones Redis (segundos)',
      labelNames: ['command'],
      buckets: [...REDIS_DURATION_BUCKETS],
      registers: [this.register],
    });
    this.sseStreamDuration = new client.Histogram({
      name: 'petai_sse_stream_duration_seconds',
      help: 'Duración de streams SSE (segundos)',
      labelNames: ['stream_type'],
      buckets: [...SSE_DURATION_BUCKETS],
      registers: [this.register],
    });
    this.gcPause = new client.Histogram({
      name: 'petai_gc_pause_seconds',
      help: 'Pausas de GC (segundos)',
      buckets: [...GC_PAUSE_BUCKETS],
      registers: [this.register],
    });
    this.socketioConnections = new client.Gauge({
      name: 'petai_socketio_active_connections',
      help: 'Conexiones Socket.IO activas',
      registers: [this.register],
    });
    this.bullmqQueueDepth = new client.Gauge({
      name: 'petai_bullmq_queue_depth',
      help: 'Profundidad de colas BullMQ',
      labelNames: ['queue'],
      registers: [this.register],
    });
    this.memoryHeapUsed = new client.Gauge({
      name: 'petai_memory_heap_used_bytes',
      help: 'Memoria heap usada por el proceso (bytes)',
      collect: () => {
        this.memoryHeapUsed.set(process.memoryUsage().heapUsed);
      },
      registers: [this.register],
    });

    // --- Métricas de CDN (feature 009-edge-cdn, US4) ---
    this.cdnHitTotal = new client.Counter({
      name: 'petai_cdn_hit_total',
      help: 'Hits de assets del CDN por región (US4)',
      labelNames: ['region', 'key'],
      registers: [this.register],
    });
    this.cdnFallbackOriginTotal = new client.Counter({
      name: 'petai_cdn_fallback_origin_total',
      help: 'Miss del CDN → fallback a origin por región (AC6/SC-006)',
      labelNames: ['region', 'key'],
      registers: [this.register],
    });
    this.cdnRefreshMs = new client.Histogram({
      name: 'petai_cdn_refresh_ms',
      help: 'Latencia del auth refresh (ms) por región y outcome (edge/origin) — p95 < 50ms',
      labelNames: ['region', 'outcome'],
      buckets: [5, 10, 20, 30, 50, 75, 100, 150, 250, 500, 1000],
      registers: [this.register],
    });
  }

  onModuleInit(): void {
    try {
      // Métricas de proceso por defecto (CPU, event loop, etc.) con prefijo petai_.
      client.collectDefaultMetrics({ prefix: 'petai_', register: this.register });
    } catch (err) {
      this.logger.warn(`No se pudieron registrar las métricas por defecto: ${(err as Error).message}`);
    }
    // Pausas de GC vía PerformanceObserver (dependency-free).
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'gc' && typeof entry.duration === 'number') {
            this.gcPause.observe((entry.duration as number) / 1000);
          }
        }
      });
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (err) {
      this.logger.warn(`GC observer no disponible: ${(err as Error).message}`);
    }
    // Sembramos los gauges para que la serie aparezca desde el arranque (dashboard inmediato).
    this.socketioConnections.set(this.socketCount);

    this.startServer();
  }

  private startServer(): void {
    if (this.server) return;
    this.server = http.createServer((req, res) => {
      const url = (req.url || '').split('?')[0];
      if (url === '/metrics') {
        this.register
          .metrics()
          .then((body) => {
            res.writeHead(200, { 'Content-Type': CONTENT_TYPE });
            res.end(body);
          })
          .catch(() => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('metric collection error');
          });
      } else if (url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
      }
    });
    this.listeningPromise = new Promise<number>((resolve) => {
      this.server!.once('listening', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') this.metricsPort = addr.port;
        resolve(this.metricsPort);
      });
      this.server!.on('error', () => {
        this.metricsPort = 0; // 0 = el servidor no está activo
        resolve(0);
      });
    });
    this.server
      .listen(this.metricsPort, '0.0.0.0', () => {
        // Si pedimos puerto 0, el SO asigna uno y lo leemos de la socket.
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.metricsPort = addr.port;
        }
        this.logger.log(`Servidor de métricas Prometheus en http://0.0.0.0:${this.metricsPort}/metrics`);
      })
      .on('error', (err) => {
        // Un puerto ocupado NO debe tumbar la app: solo deshabilitamos el endpoint de métricas.
        this.logger.warn(`No se pudo levantar el servidor de métricas: ${(err as Error).message}`);
      });
  }

  /** Puerto real en el que escucha el servidor de métricas (útil en tests con puerto 0). */
  getMetricsPort(): number {
    return this.metricsPort;
  }

  /** Resuelve con el puerto real cuando el servidor termina de levantarse. */
  whenListening(): Promise<number> {
    return this.listeningPromise ?? Promise.resolve(this.metricsPort);
  }

  /** Devuelve los nombres de métricas registradas (para tests/dashboards). */
  async getMetricNames(): Promise<string[]> {
    return this.register.getMetricsAsArray().map((m) => m.name);
  }

  // ---------------------------------------------------------------------
  // Helpers de registro (usados por interceptor, prisma, redis, websocket, bullmq)
  // ---------------------------------------------------------------------

  /** Registra una request HTTP completada. */
  recordHttp(method: string, route: string, status: number, durationSeconds: number): void {
    try {
      this.httpDuration.labels(method, route, String(status)).observe(Math.max(0, durationSeconds));
    } catch {
      // Nunca dejamos que una métrica rompa la ruta crítica (FR-010).
    }
  }

  /** Métricas de CDN (US4): hit servido por región (label `key` opcional, default `total`). */
  recordCdnHit(region: string, key = 'total'): void {
    try {
      this.cdnHitTotal.labels(region || 'unknown', key).inc();
    } catch {
      /* noop */
    }
  }

  /** Métricas de CDN (US4): fallback a origin por región tras un miss del CDN. */
  recordCdnFallbackOrigin(region: string, key = 'total'): void {
    try {
      this.cdnFallbackOriginTotal.labels(region || 'unknown', key).inc();
    } catch {
      /* noop */
    }
  }

  /** Métricas de CDN (US4): latencia del auth refresh en ms (outcome `edge`/`origin`). */
  recordCdnRefreshMs(ms: number, region: string, outcome: 'edge' | 'origin'): void {
    try {
      this.cdnRefreshMs.labels(region || 'unknown', outcome).observe(Math.max(0, ms));
    } catch {
      /* noop */
    }
  }

  /** Registra una consulta a PostgreSQL (duración en segundos). */
  recordDbQuery(durationSeconds: number): void {
    try {
      this.dbQueryDuration.observe(Math.max(0, durationSeconds));
    } catch {
      /* noop */
    }
  }

  /** Registra una operación Redis (duración en segundos, con etiqueta `command`). */
  recordRedisOperation(command: string, durationSeconds: number): void {
    try {
      this.redisOpDuration.labels(command).observe(Math.max(0, durationSeconds));
    } catch {
      /* noop */
    }
  }

  /** Registra la duración de un stream SSE (segundos). */
  recordSseStream(streamType: string, durationSeconds: number): void {
    try {
      this.sseStreamDuration.labels(streamType).observe(Math.max(0, durationSeconds));
    } catch {
      /* noop */
    }
  }

  /** Aumenta/disminuye las conexiones Socket.IO activas. */
  incSocketConnections(delta = 1): void {
    try {
      this.socketCount = Math.max(0, this.socketCount + delta);
      this.socketioConnections.set(this.socketCount);
    } catch {
      /* noop */
    }
  }

  /** Número de conexiones Socket.IO activas (síncrono, para tests/health). */
  getSocketConnections(): number {
    return this.socketCount;
  }

  /** Setea la profundidad de una cola BullMQ. */
  setBullmqQueueDepth(queue: string, depth: number): void {
    try {
      this.bullmqQueueDepth.labels(queue).set(Math.max(0, depth));
    } catch {
      /* noop */
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.gcObserver?.disconnect();
    } catch {
      /* noop */
    }
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      // Cierra las conexiones keep-alive colgadas para que `close()` no espere al
      // keepAliveTimeout (~5s) y libere el socket de inmediato. En la suite e2e (24
      // AppModule en el mismo worker) esas conexiones se acumulaban y acababan
      // agotando puertos efímeros (el listen(0) del servidor de métricas fallaba →
      // puerto 0) y dejaban el worker sin salir con limpieza.
      this.server.closeIdleConnections?.();
      this.server = null;
    });
  }
}
