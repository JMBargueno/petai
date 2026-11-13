/**
 * Utilidades de contexto de trace (T023).
 *
 * Exponen el traceId/spanId del contexto activo (para logs y propagación) y permiten
 * reconstruir un span hijo a partir de un traceId remoto (p. ej. el que el cliente pasa en el
 * handshake de Socket.IO vía el header `x-trace-id`).
 */
import { context as otelContext, Context, Span, trace } from '@opentelemetry/api';
import { OTEL_SERVICE_NAME } from './otel.constants';

/** traceId del span activo (undefined si no hay contexto de trace). */
export function getActiveTraceId(): string | undefined {
  return trace.getSpan(otelContext.active())?.spanContext().traceId;
}

/** spanId del span activo (undefined si no hay contexto de trace). */
export function getActiveSpanId(): string | undefined {
  return trace.getSpan(otelContext.active())?.spanContext().spanId;
}

/**
 * Crea un span hijo vinculado a un traceId remoto recibido (handshake de WebSocket o payload de
 * BullMQ). Si no se recibe traceId válido se abre un nuevo trace.
 *
 * @param name Nombre del span (p. ej. "realtime.connection").
 * @param parentTraceId traceId remoto en formato hex de 32 caracteres (opcional).
 * @param parentSpanId spanId remoto (opcional).
 */
export function startSpanFromRemoteTrace(
  name: string,
  parentTraceId?: string,
  parentSpanId?: string,
  attributes: Record<string, unknown> = {},
): { span: Span; parentTraceId?: string } {
  const tracer = trace.getTracer(OTEL_SERVICE_NAME);
  const validTraceId = isValidTraceId(parentTraceId) ? parentTraceId : undefined;

  if (validTraceId) {
    // Vinculamos el span al trace remoto usando un link (estándar OTel para contextos
    // no propagados por header) para que los backends de traces lo agrupen con el origen.
    const spanContext = {
      traceId: validTraceId,
      spanId: isValidSpanId(parentSpanId) ? parentSpanId : '0000000000000001',
      isRemote: true,
      traceFlags: 1,
    };
    const span = tracer.startSpan(name, {
      // El shape de `Link` varía entre versiones de la API; el cast garantiza compatibilidad.
      links: [{ ...spanContext, attributes: { 'trace.ancestors': validTraceId } } as never],
      attributes,
    });
    return { span, parentTraceId: validTraceId };
  }

  // Sin traceId de origen: nuevo trace.
  const span = tracer.startSpan(name, { attributes });
  return { span };
}

/**
 * Devuelve un contexto OTel con el span dado como activo, para propagarlo de forma asíncrona
 * (p. ej. al ejecutar el cuerpo de un evento de WebSocket o de un job de BullMQ).
 */
export function withSpan(span: Span): Context {
  return trace.setSpan(otelContext.active(), span);
}

export function isValidTraceId(value?: string | null): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value) && value !== '0'.repeat(32);
}

export function isValidSpanId(value?: string | null): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/i.test(value) && value !== '0'.repeat(16);
}
