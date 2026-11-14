/**
 * Constantes del módulo de observabilidad (T004).
 *
 * Centralizan el nombre del servicio, los atributos de recurso, los umbrales de los
 * histogramas (para mantener la cardinalidad controlada y permitir calcular p50/p95/p99)
 * y las claves que deben redactarse en logs/spans/métricas (FR-011, SC-004).
 */

/** Identidad del servicio tal y como aparece en traces, métricas y logs. */
export const OTEL_SERVICE_NAME = 'petai-backend';
/** Versión por defecto del servicio (sobrescribible vía OTEL_SERVICE_VERSION). */
export const OTEL_SERVICE_VERSION = '0.1.0';

/**
 * Umbrales de buckets (en segundos) para el histograma de latencia HTTP.
 * Cubren desde 5 ms hasta 2 s, suficientes para detectar el umbral de alerta p95 > 200 ms.
 */
export const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2] as const;

/** Umbrales (s) para el histograma de consultas a PostgreSQL. */
export const DB_DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] as const;

/** Umbrales (s) para el histograma de operaciones Redis. */
export const REDIS_DURATION_BUCKETS = [0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25] as const;

/** Umbrales (s) para el histograma de duración de streams SSE. */
export const SSE_DURATION_BUCKETS = [0.1, 0.5, 1, 5, 10, 30, 60, 120] as const;

/** Umbrales (s) para el histograma de pausas de GC. */
export const GC_PAUSE_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] as const;

/**
 * Claves (en minúsculas, sin prefijo) cuyo valor debe redactarse a "[REDACTED]"
 * cuando aparecen en logs, atributos de span o payloads. La redacción es obligatoria
 * (FR-011): API keys, tokens JWT y PII no deben aparecer en los datos observados.
 */
export const REDACT_KEYS = [
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'authorization',
  'password',
  'secret',
  'clientsecret',
  'client_secret',
  'ssn',
  'creditcard',
] as const;

export const REDACTED_VALUE = '[REDACTED]';

/** Clave del header/handshake a través del cual se propaga el traceId a WebSocket. */
export const TRACE_HEADER = 'x-trace-id';
export const SPAN_HEADER = 'x-span-id';
