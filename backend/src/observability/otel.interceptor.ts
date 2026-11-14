/**
 * Interceptor HTTP de OpenTelemetry (T018).
 *
 * Abre un span por request con labels `method`/`route`/`status` y registra la latencia en el
 * histograma `petai_http_request_duration_seconds`. Es NO INVASIVO: se aplica globalmente vía
 * `APP_INTERCEPTOR` y no modifica ningún controller. En caso de excepción marca el span como
 * error y registra el status 5xx.
 *
 * La ruta se normaliza (usa la plantilla de la ruta, no el valor dinámico) para no disparar la
 * cardinalidad de las métricas. El span se enlaza al span activo (el span de servidor que abre
 * la auto-instrumentación del NodeSDK) para formar parte del mismo trace.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { OTEL_SERVICE_NAME } from './otel.constants';
import { MetricsService } from './metrics.service';

interface HttpLikeRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  baseUrl?: string;
  route?: { path?: string };
  headers?: Record<string, unknown>;
  res?: { statusCode?: number };
}

function resolveRoute(req: HttpLikeRequest): string {
  // Preferimos la plantilla de la ruta (ej. /pets/:id) sobre el valor dinámico (/pets/123).
  if (req.route?.path) {
    return `${req.baseUrl ?? ''}${req.route.path}`;
  }
  const raw = req.originalUrl || req.url || '/';
  return raw.split('?')[0] || '/';
}

function resolveStatus(req: HttpLikeRequest): number {
  if (req.res?.statusCode) return req.res.statusCode;
  return 200;
}

@Injectable()
export class OtelHttpInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<HttpLikeRequest>();
    const method = req.method?.toUpperCase() ?? 'GET';
    const start = process.hrtime.bigint();

    const tracer = trace.getTracer(OTEL_SERVICE_NAME);
    // El NodeSDK ya abre un span de servidor para HTTP entrante; si existe, el nuestro es hijo.
    const hasParent = !!trace.getActiveSpan();
    const span = tracer.startSpan(`${method} (http)`, {
      kind: hasParent ? SpanKind.CLIENT : SpanKind.SERVER,
      attributes: {
        'http.request.method': method,
        'http.route': resolveRoute(req),
      },
    });
    const requestId = (req.headers?.['x-request-id'] as string | undefined) || undefined;
    if (requestId) span.setAttribute('http.request_id', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          this.finish(span, resolveStatus(req), start, req, method);
        },
        error: (err) => {
          const status = resolveStatus(req) >= 400 ? resolveStatus(req) : 500;
          span.recordException(err);
          this.finish(span, status, start, req, method, true);
        },
      }),
    );
  }

  private finish(
    span: import('@opentelemetry/api').Span,
    status: number,
    start: bigint,
    req: HttpLikeRequest,
    method: string,
    isError = false,
  ): void {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = resolveRoute(req);
    // Métrica (labels normalizados).
    this.metrics.recordHttp(method, route, status, durationSeconds);
    // Span: cerramos con status correcto.
    if (isError || status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
    }
    span.setAttribute('http.response.status_code', status);
    span.setAttribute('http.request.method', method);
    span.setAttribute('http.route', route);
    span.end();
  }
}

