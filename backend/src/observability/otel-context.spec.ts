import { getActiveSpanId, getActiveTraceId, isValidSpanId, isValidTraceId, startSpanFromRemoteTrace, withSpan } from './otel-context';

/**
 * Tests de las utilidades de contexto de trace (T041, US3).
 * Se ejecutan sin SDK activo (tracer no-op), lo que valida la lógica de validación y
 * de construcción de spans a partir de un traceId remoto.
 */
const VALID_TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const VALID_SPAN = '00f067aa0ba902b7';

describe('otel-context', () => {
  it('isValidTraceId valida formato hex de 32 chars (y rechaza el nulo)', () => {
    expect(isValidTraceId(VALID_TRACE)).toBe(true);
    expect(isValidTraceId('abc')).toBe(false);
    expect(isValidTraceId('0'.repeat(32))).toBe(false);
    expect(isValidTraceId(undefined)).toBe(false);
    expect(isValidTraceId('G'.repeat(32))).toBe(false);
  });

  it('isValidSpanId valida formato hex de 16 chars', () => {
    expect(isValidSpanId(VALID_SPAN)).toBe(true);
    expect(isValidSpanId('xyz')).toBe(false);
    expect(isValidSpanId('0'.repeat(16))).toBe(false);
  });

  it('getActiveTraceId devuelve undefined sin contexto activo', () => {
    expect(getActiveTraceId()).toBeUndefined();
    expect(getActiveSpanId()).toBeUndefined();
  });

  it('startSpanFromRemoteTrace vincula un traceId remoto válido', () => {
    const { span, parentTraceId } = startSpanFromRemoteTrace('realtime.connection', VALID_TRACE, VALID_SPAN);
    expect(parentTraceId).toBe(VALID_TRACE);
    expect(span).toBeDefined();
  });

  it('startSpanFromRemoteTrace abre un nuevo trace si el traceId es inválido', () => {
    const { span, parentTraceId } = startSpanFromRemoteTrace('bullmq.process', 'nope');
    expect(parentTraceId).toBeUndefined();
    expect(span).toBeDefined();
  });

  it('withSpan devuelve un contexto (no lanza)', () => {
    const { span } = startSpanFromRemoteTrace('test.span', VALID_TRACE);
    expect(() => withSpan(span)).not.toThrow();
  });
});
