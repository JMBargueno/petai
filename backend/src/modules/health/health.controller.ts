import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../../observability/metrics.service';
import { getActiveTraceCount, getOtelStatus } from '../../observability/otel-sdk';
import { OTEL_SERVICE_VERSION } from '../../observability/otel.constants';

/** Estado de un componente en los sub-checks de `GET /health` (FR-007). */
type ComponentState = 'ok' | 'degraded' | 'fail';

/** Resultado de un sub-check por componente. */
interface ComponentCheck {
  status: ComponentState;
  /** Latencia de la sonda (ms) — db/redis. */
  latency_ms?: number;
  /** Workers activos — bullmq. */
  active_workers?: number;
}

/** Sondas para balanceadores y orquestadores (sin autenticación y sin datos sensibles). */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Health con sub-checks por componente: db, redis, bullmq + uptime + version (FR-007)',
  })
  async health() {
    return this.buildHealth();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: mismos sub-checks que /health (db crítico → 503 si está caído)' })
  async ready() {
    return this.buildHealth();
  }

  /**
   * FR-007: estado por componente (`db`, `redis`, `bullmq`) además de `uptime` y `version`.
   *  - `db` (PostgreSQL) es CRÍTICO: si falla, responde 503 (ServiceUnavailable).
   *  - `redis` y `bullmq` son DEGRADABLES (hay respaldo en la base de datos), por lo que solo
   *    degradan el estado global a `degraded`, no lo llevan a `down`.
   */
  private async buildHealth() {
    const checks: Record<string, ComponentCheck> = {};

    // --- PostgreSQL (crítico) ---
    const dbStart = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = { status: 'ok', latency_ms: this.nsToMs(process.hrtime.bigint() - dbStart) };
    } catch {
      checks.db = { status: 'fail', latency_ms: this.nsToMs(process.hrtime.bigint() - dbStart) };
    }

    // --- Redis (degradable) ---
    const redisStart = process.hrtime.bigint();
    const pong = await this.redis.run((r) => r.ping(), 'ping');
    checks.redis = {
      status: pong === 'PONG' ? 'ok' : 'degraded',
      latency_ms: this.nsToMs(process.hrtime.bigint() - redisStart),
    };

    // --- BullMQ ---
    // Los jobs se procesan in-proceso (ver ADR en `chests.processor.ts`): no hay pool de workers
    // externo, así que `active_workers` es 0. La salud de BullMQ depende de su broker (Redis), por lo
    // que se degrada junto con él. La profundidad de colas se expone aparte en `GET /metrics`.
    checks.bullmq = {
      status: pong === 'PONG' ? 'ok' : 'degraded',
      active_workers: 0,
    };

    // DB crítico: si está caído, el servicio no está listo.
    if (checks.db.status === 'fail') {
      throw new ServiceUnavailableException({
        status: 'down',
        checks,
        uptime: process.uptime(),
        version: OTEL_SERVICE_VERSION,
      });
    }

    const status: ComponentState =
      checks.redis.status === 'degraded' || checks.bullmq.status === 'degraded' ? 'degraded' : 'ok';

    return {
      status,
      checks,
      uptime: process.uptime(),
      version: OTEL_SERVICE_VERSION,
    };
  }

  /** Convierte nanosegundos (de `process.hrtime.bigint()`) a milisegundos (2 decimales). */
  private nsToMs(ns: bigint): number {
    return Math.round(Number(ns) / 1e6 * 100) / 100;
  }

  @Get('otel')
  @ApiOperation({ summary: 'Estado del pipeline de OpenTelemetry (exporter, sampling, buffer)' })
  otel() {
    const status = getOtelStatus();
    // El endpoint de métricas (prom-client) siempre está activo; el SDK de traces/logs puede estar caído.
    const degraded = status.enabled && (!status.tracesExporting || !!status.lastExportError);
    const otel: Record<string, unknown> = {
      enabled: status.enabled,
      exporter: status.exporter,
      exporter_endpoint: status.exporterEndpoint || null,
      traces_exporting: status.enabled ? status.tracesExporting : false,
      metrics_exporting: true,
      logs_exporting: status.enabled,
      sampling_rate: status.samplingRate,
      active_traces_in_buffer: getActiveTraceCount(),
      last_export_timestamp: status.lastExportTimestamp ? new Date(status.lastExportTimestamp).toISOString() : null,
    };
    if (status.lastExportError) otel.last_export_error = status.lastExportError;
    return {
      status: degraded ? 'degraded' : 'ok',
      uptime: process.uptime(),
      version: OTEL_SERVICE_VERSION,
      otel,
    };
  }
}
