/**
 * Helper de propagación de trace a BullMQ (T025, T026).
 *
 * BullMQ se añade en las Feature #1/#2; este módulo prepara la infraestructura para que, cuando
 * exista, el `traceId` viaje dentro del payload del job y el worker abra spans hijos del mismo
 * trace. Está pensado para ser REUTILIZABLE y no romper nada si BullMQ aún no está inicializado.
 *
 * - `wrapJobPayload(data, extra)` serializa `traceId`/`spanId` del contexto activo en el payload.
 * - `processJobWithContext(job, handler, name)` abre un span hijo del `traceId` del job y ejecuta
 *   el handler dentro de ese contexto.
 * - `reportQueueDepth(queue, depth)` actualiza el gauge `petai_bullmq_queue_depth`.
 */
import { trace, context as otelContext } from '@opentelemetry/api';
import { getActiveSpanId, getActiveTraceId, isValidTraceId, withSpan, startSpanFromRemoteTrace } from './otel-context';
import { OTEL_SERVICE_NAME } from './otel.constants';

export interface TracedJobPayload<T = unknown> {
  data: T;
  traceId?: string;
  spanId?: string;
}

/** Serializa el contexto de trace activo en el payload de un job. */
export function wrapJobPayload<T>(data: T, extra: Record<string, unknown> = {}): TracedJobPayload<T> {
  return {
    data,
    ...extra,
    traceId: getActiveTraceId(),
    spanId: getActiveSpanId(),
  };
}

/** Extrae el traceId de un payload (compatible con payloads que aún no llevan traceId). */
export function jobTraceId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object') {
    const p = payload as Partial<TracedJobPayload>;
    return isValidTraceId(p.traceId) ? p.traceId : undefined;
  }
  return undefined;
}

/**
 * Ejecuta un job de BullMQ dentro de un span hijo del traceId del payload. Devuelve un Observable
 * para poder usarse dentro de un `Processor` de BullMQ (que se integra con rxjs).
 */
export async function processJobWithContext<T>(
  job: { data?: unknown } | unknown,
  handler: (data: T) => Promise<unknown>,
  name = 'bullmq.process',
): Promise<unknown> {
  const payload = (job as { data?: unknown })?.data ?? (job as unknown);
  const remoteTraceId = jobTraceId(payload);
  const { span } = startSpanFromRemoteTrace(
    name,
    remoteTraceId,
    (payload as TracedJobPayload | undefined)?.spanId,
    { 'messaging.system': 'bullmq', 'messaging.operation': 'process' },
  );

  const ctx = withSpan(span);
  return otelContext.with(ctx, async () => {
    try {
      const data = (payload as TracedJobPayload<T>)?.data ?? (payload as T);
      const result = await handler(data as T);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: 2 /* ERROR */ });
      span.end();
      throw err;
    }
  });
}

/**
 * Reporta la profundidad de una cola BullMQ al gauge `petai_bullmq_queue_depth`.
 * No-op si el callback de reporte no está disponible (BullMQ aún no inicializado).
 */
export function reportQueueDepth(
  queueName: string,
  depth: number,
  report: (queue: string, depth: number) => void,
): void {
  try {
    report(queueName, depth);
  } catch {
    // Nunca dejamos que el reporte de métricas rompa el procesamiento del job (FR-010).
  }
}

/** Factory de span para BullMQ (acceso directo al tracer, útil si se desea trazar a mano). */
export function bullmqTracer() {
  return trace.getTracer(OTEL_SERVICE_NAME);
}
