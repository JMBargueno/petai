/**
 * Correlación y redacción de logs (pino) (T027, T028).
 *
 * - Inyecta `traceId`/`spanId` del contexto OTel activo en cada línea de log (SC-004).
 * - Redacta de forma obligatoria secrets/PII (`token`, `apiKey`, `authorization`, `password`, …)
 *   a "[REDACTED]" (FR-011, FR-006).
 *
 * Se usa desde `main.ts` para configurar el logger de pino de Nest y desde `log-serializer.spec.ts`
 * para validar el comportamiento de forma aislada.
 */
import { context as otelContext, trace } from '@opentelemetry/api';
import { REDACTED_VALUE, REDACT_KEYS } from './otel.constants';

/** Valores de `level` de pino que consideramos "ruidosos" (debug). */
export const DEFAULT_LOG_LEVEL = 'info';

/**
 * Customizer de pino: añade `traceId`/`spanId` del contexto activo (si existe) y aplica la
 * redacción obligatoria sobre el objeto resultante.
 *
 * @param log Objeto de log (mutado en sitio por pino).
 * @param extra Opciones: `requestId` a incluir, `depth` máximo de redacción.
 */
export function otelLogCustomizer(
  log: Record<string, unknown>,
  extra: { requestId?: string; userId?: string } = {},
): Record<string, unknown> {
  const span = trace.getSpan(otelContext.active());
  if (span) {
    const sc = span.spanContext();
    if (sc?.traceId) log.traceId = sc.traceId;
    if (sc?.spanId) log.spanId = sc.spanId;
  }
  if (extra.requestId) log.requestId = extra.requestId;
  if (extra.userId) log.userId = extra.userId;

  return redact(log, 0);
}

/**
 * Redacción obligatoria: recorre un objeto y sustituye por "[REDACTED]" el valor de cualquier
 * clave (case-insensitive) presente en `REDACT_KEYS`. No se redactan arrays ni funciones.
 * Es no-destructiva: devuelve una copia.
 */
export function redact<T extends Record<string, unknown>>(obj: T, depth = 0, maxDepth = 8): T {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return obj;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isRedactKey(key)) {
      out[key] = REDACTED_VALUE;
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !isBuffer(value)) {
      out[key] = redact(value as Record<string, unknown>, depth + 1, maxDepth);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function isRedactKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return REDACT_KEYS.some((k) => k.toLowerCase().replace(/[-_]/g, '') === normalized);
}

function isBuffer(value: unknown): boolean {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

/**
 * Lista de paths de pino (`redact`) para redactar automáticamente los headers de autorización
 * y los campos conocidos de los payloads. Se complementa con la redacción profunda de `redact`.
 */
export function buildPinoRedactPaths(): string[] {
  return [
    '*.token',
    '*.accessToken',
    '*.refreshToken',
    '*.apiKey',
    '*.api_key',
    '*.authorization',
    '*.password',
    '*.secret',
    '*.clientSecret',
    '*.client_secret',
    'authorization',
  ];
}

/**
 * Adapta una instancia de pino al `LoggerService` de Nest para poder hacer
 * `NestFactory.create(AppModule, { logger })`. Cada llamada inyecta `traceId`/`spanId` del
 * contexto activo y aplica la redacción obligatoria (FR-011, SC-004).
 */
export class PinoNestLogger {
  constructor(private readonly pino: any) {}

  private emit(level: number, message: unknown, meta?: Record<string, unknown>) {
    const base: Record<string, unknown> = { ...(meta ?? {}) };
    // Inyectamos traceId/spanId del contexto activo y redactamos antes de escribir.
    const span = trace.getSpan(otelContext.active());
    const sc = span?.spanContext();
    if (sc?.traceId) base.traceId = sc.traceId;
    if (sc?.spanId) base.spanId = sc.spanId;

    const redacted = redact(base, 0);
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.pino[level](redacted, msg);
  }

  log(message: unknown, context?: string): void {
    this.emit(30, message, context ? { context } : undefined);
  }
  error(message: unknown, stackOrContext?: string, context?: string): void {
    // Nest pasa (message, stack, context) cuando hay una excepción.
    const meta: Record<string, unknown> = {};
    if (typeof stackOrContext === 'string' && stackOrContext.includes('\n')) meta.stack = stackOrContext;
    else if (context) meta.context = context;
    else if (typeof stackOrContext === 'string') meta.context = stackOrContext;
    this.emit(50, message, meta);
  }
  warn(message: unknown, context?: string): void {
    this.emit(40, message, context ? { context } : undefined);
  }
  debug(message: unknown, context?: string): void {
    this.emit(20, message, context ? { context } : undefined);
  }
  verbose(message: unknown, context?: string): void {
    this.emit(10, message, context ? { context } : undefined);
  }
}

/**
 * Crea el logger de pino para Nest. En producción emite JSON plano; en desarrollo usa
 * pino-pretty (salvo en test, donde se evita el transport para no levantar un worker).
 */
export function createNestLogger(nodeEnv?: string): PinoNestLogger {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pino = require('pino');
  const env = nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const pretty = env === 'development';
  const options: Record<string, unknown> = {
    level: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
    redact: buildPinoRedactPaths(),
    base: { service: 'petai-backend' },
    timestamp: pinoTime(),
  };
  if (pretty) {
    options.transport = { target: 'pino-pretty', options: { colorize: true } };
  }
  return new PinoNestLogger(pino(options));
}

function pinoTime() {
  return () => JSON.stringify({ time: Date.now() });
}

