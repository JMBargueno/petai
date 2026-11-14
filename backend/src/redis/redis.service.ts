import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { MetricsService } from '../observability/metrics.service';
import { OTEL_SERVICE_NAME } from '../observability/otel.constants';

/**
 * Cliente de Redis tolerante a fallos: si Redis no está disponible, `run` devuelve null en vez de
 * lanzar, y quien lo usa recurre a un respaldo en PostgreSQL. Las claves llevan el prefijo del
 * entorno (petai:test:, petai:development:…) para que los tests no se mezclen con los datos reales.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private warned = false;
  readonly prefix: string;

  constructor(private readonly config: ConfigService, private readonly metrics: MetricsService) {
    this.prefix = `petai:${this.config.get<string>('NODE_ENV') ?? 'development'}:`;
  }

  key(name: string): string {
    return `${this.prefix}${name}`;
  }

  private getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        retryStrategy: (times) => Math.min(times * 500, 5000),
      });
      this.client.on('error', (err) => {
        if (!this.warned) {
          this.warned = true;
          this.logger.warn(`Redis no disponible (${err.message}); se usará el respaldo en la base de datos`);
        }
      });
      this.client.on('ready', () => {
        this.warned = false;
      });
    }
    return this.client;
  }

  /**
   * Ejecuta una operación; devuelve null si Redis falla o no responde.
   * `command` (opcional) se usa como etiqueta de la métrica `petai_redis_operation_duration_seconds`
   * y como nombre del span hijo `redis.command` (SC-001): se anida bajo el span activo de la request
   * para completar el tree … → service → Redis. La métrica y el span son independientes (sin duplicidad).
   */
  async run<T>(fn: (redis: Redis) => Promise<T>, command = 'redis'): Promise<T | null> {
    const start = process.hrtime.bigint();
    const tracer = trace.getTracer(OTEL_SERVICE_NAME);
    const span = tracer.startSpan('redis.command', {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'redis',
        'db.operation': command,
        'messaging.system': 'redis',
      },
    });
    try {
      const client = this.getClient();
      if (client.status === 'wait' || client.status === 'end') await client.connect();
      const result = await fn(client);
      this.metrics.recordRedisOperation(command, Number(process.hrtime.bigint() - start) / 1e9);
      return result;
    } catch (err: any) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
      this.metrics.recordRedisOperation(command, Number(process.hrtime.bigint() - start) / 1e9);
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(`Fallo de Redis (${err?.message}); se usará el respaldo en la base de datos`);
      }
      return null;
    } finally {
      span.end();
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
