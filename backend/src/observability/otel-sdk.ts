/**
 * Inicialización del SDK de OpenTelemetry (T005, T011).
 *
 * Se inicializa una sola vez en `main.ts` ANTES de `NestFactory.create()`. Diseño:
 *  - Traces: exportador OTLP gRPC con fallback a OTLP HTTP (FR-014, FR-015).
 *  - BatchSpanProcessor con timeout acotado para que un fallo de exportación NO bloquee ni
 *    degrade la ruta crítica (FR-010, SC-008).
 *  - Sampler `parentbased_traceidratio` (1.0 en desarrollo, 10–20% en producción, FR-013).
 *  - Aislamiento de fallos: un exportador caído solo hace que el estado pase a "degraded"
 *    (visible en `GET /v1/health/otel`); nunca lanza ni retiene peticiones.
 *
 * Si no se configura `OTEL_EXPORTER_OTLP_ENDPOINT` (p. ej. desarrollo local sin Docker) el
 * SDK no se arranca y la observabilidad queda "desactivada" de forma segura: el endpoint de
 * métricas y los logs correlacionados siguen funcionando, solo que sin exportación remota.
 */
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPHttpTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTEL_SERVICE_NAME, OTEL_SERVICE_VERSION } from './otel.constants';

/** Estado observable del pipeline de OTel (expuesto por `GET /v1/health/otel`). */
export interface OtelStatus {
  enabled: boolean;
  exporter: string;
  exporterEndpoint: string;
  samplingRate: number;
  /** true si hay al menos un export de traces/métricas/logs activo y sin error reciente. */
  tracesExporting: boolean;
  lastExportTimestamp?: number;
  lastExportError?: string;
}

const DEFAULT_STATUS: OtelStatus = {
  enabled: false,
  exporter: 'none',
  exporterEndpoint: '',
  samplingRate: 0,
  tracesExporting: false,
};

let currentStatus: OtelStatus = { ...DEFAULT_STATUS };
/** Contador de spans activos (in-flight) en el proceso, para `active_traces_in_buffer`. */
let activeTraces = 0;
/** Instancia del SDK para poder cerrarlo de forma ordenada. */
let sdkInstance: NodeSDK | null = null;

/**
 * Contador de spans activos. No exporta: solo incrementa/disminuye un contador para poder
 * informar cuántos traces hay en vuelo (campo `active_traces_in_buffer`).
 */
class ActiveTraceCounter implements SpanProcessor {
  onStart(): void {
    activeTraces += 1;
  }
  onEnd(): void {
    activeTraces = Math.max(0, activeTraces - 1);
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Exportador con fallback: intenta el exportador primario (gRPC) y, si falla, reenvía los
 * spans al exportador secundario (HTTP). Ambos errores se tragan (isolation, FR-010) y solo
 * se reflejan en el estado para el endpoint de salud.
 */
class OtlpFallbackExporter implements SpanExporter {
  constructor(
    private readonly primary: SpanExporter,
    private readonly fallback: SpanExporter,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: { code: number; error?: Error }) => void): void {
    this.primary.export(spans, (primaryResult) => {
      if (primaryResult.code === 0) {
        currentStatus.lastExportTimestamp = Date.now();
        currentStatus.tracesExporting = true;
        delete currentStatus.lastExportError;
        resultCallback(primaryResult);
        return;
      }
      // Falla el primario: probamos el fallback.
      this.fallback.export(spans, (fallbackResult) => {
        if (fallbackResult.code === 0) {
          currentStatus.lastExportTimestamp = Date.now();
          currentStatus.tracesExporting = true;
          delete currentStatus.lastExportError;
        } else {
          currentStatus.tracesExporting = false;
          currentStatus.lastExportError =
            fallbackResult.error?.message || primaryResult.error?.message || 'export failed';
        }
        resultCallback(fallbackResult);
      });
    });
  }

  forceFlush(): Promise<void> {
    return Promise.allSettled([this.primary.forceFlush(), this.fallback.forceFlush()]).then(() => undefined);
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([this.primary.shutdown(), this.fallback.shutdown()]);
  }
}

/** Deriva la URL HTTP (puerto 4318) a partir de un endpoint OTLP (p. ej. gRPC en 4317). */
function deriveHttpUrl(endpoint: string, path: string): string {
  const base = endpoint.replace(/:\d+$/, '').replace(/\/+$/, '');
  return `${base}:4318${path}`;
}

/**
 * Arranca el SDK de OpenTelemetry. Idempotente: si ya está activo no hace nada.
 * Devuelve true si se arrancó, false si quedó desactivado (sin endpoint o por error).
 */
export function initOtel(config: ConfigService): boolean {
  if (currentStatus.enabled) return true;

  const endpoint = (config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT') ?? '').trim();
  if (!endpoint) {
    // Sin backend de exportación: observabilidad desactivada de forma segura.
    currentStatus = { ...DEFAULT_STATUS };
    return false;
  }

  const protocol = (config.get<string>('OTEL_EXPORTER_OTLP_PROTOCOL') ?? 'grpc').toLowerCase();
  const samplingRate = config.get<number>('OTEL_TRACES_SAMPLER_ARG') ?? 1.0;
  const serviceName = config.get<string>('OTEL_SERVICE_NAME') ?? OTEL_SERVICE_NAME;
  const serviceVersion = config.get<string>('OTEL_SERVICE_VERSION') ?? OTEL_SERVICE_VERSION;
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';

  const resource = resourceFromAttributes({
    'service.name': serviceName,
    'service.version': serviceVersion,
    'deployment.environment': nodeEnv,
  });

  // --- Exportadores de traces: gRPC con fallback HTTP (o viceversa) ---
  let primaryTrace: SpanExporter;
  let fallbackTrace: SpanExporter;
  if (protocol === 'http') {
    primaryTrace = new OTLPHttpTraceExporter({ url: `${endpoint.replace(/\/+$/, '')}/v1/traces` });
    fallbackTrace = new OTLPTraceExporter({ url: endpoint });
  } else {
    primaryTrace = new OTLPTraceExporter({ url: endpoint });
    fallbackTrace = new OTLPHttpTraceExporter({ url: deriveHttpUrl(endpoint, '/v1/traces') });
  }
  const traceExporter = new OtlpFallbackExporter(primaryTrace, fallbackTrace);

  // --- Logs: OTLP HTTP (pipeline SDK). Los logs de la app van por pino (ver log-serializer.ts) ---
  const logProcessor = new BatchLogRecordProcessor({
    exporter: new OTLPLogExporter({ url: deriveHttpUrl(endpoint, '/v1/logs') }),
  });

  const spanProcessors: SpanProcessor[] = [
    new BatchSpanProcessor(traceExporter, {
      scheduledDelayMillis: 5000,
      // Timeout acotado: si el exportador tarda más, se abandona el batch (FR-010).
      exportTimeoutMillis: 3000,
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
    }),
    new ActiveTraceCounter(),
  ];

  const sampler = new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(samplingRate) });

  // El NodeSDK puede usar una línea de versiones distinta de sdk-trace-base; el cast garantiza
  // compatibilidad estructural en tiempo de ejecución (los SpanProcessors son duck-typed).
  const sdkConfig = {
    resource,
    autoDetectMetrics: false, // las métricas las expone prom-client (ver metrics.service.ts)
    autoDetectLogs: false,
    // Cierra el SDK de forma ordenada al recibir SIGINT/SIGTERM (flush sin bloquear).
    shutdownHooks: true,
    traces: {
      sampler,
      spanProcessor: spanProcessors,
    },
    logs: {
      logRecordProcessor: logProcessor,
    },
  } as unknown as ConstructorParameters<typeof NodeSDK>[0];

  try {
    sdkInstance = new NodeSDK(sdkConfig);
    sdkInstance.start();
  } catch (err) {
    // No dejamos que un fallo de arranque del SDK tumbe la app.
    // eslint-disable-next-line no-console
    console.warn('[OTel] No se pudo inicializar el SDK de OpenTelemetry:', (err as Error).message);
    currentStatus = { ...DEFAULT_STATUS, exporterEndpoint: endpoint };
    return false;
  }

  currentStatus = {
    enabled: true,
    exporter: protocol === 'http' ? 'otlp-http' : 'otlp-grpc',
    exporterEndpoint: endpoint,
    samplingRate,
    tracesExporting: true,
  };
  return true;
}

/** Cierra el SDK de forma ordenada al detener la app. */
export async function shutdownOtel(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch {
      // Ignorado: el cierre no debe fallar.
    }
    sdkInstance = null;
  }
}

/** Devuelve una copia del estado actual para el endpoint de salud. */
export function getOtelStatus(): OtelStatus {
  return { ...currentStatus };
}

/** Número de traces en vuelo (spans activos). */
export function getActiveTraceCount(): number {
  return activeTraces;
}

/** Forcea el estado para pruebas (permite simular un exporter caído sin backend real de OTLP). */
export function __setOtelStatusForTests(partial: Partial<OtelStatus>): void {
  currentStatus = { ...currentStatus, ...partial };
}

