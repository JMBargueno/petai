import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { MetricsService } from '../observability/metrics.service';
import { OTEL_SERVICE_NAME } from '../observability/otel.constants';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly metrics: MetricsService) {
    // Emitimos eventos de query (solo por eventos, sin consola) para poder medir la duración
    // sin añadir una middleware invásiva. Solo leemos `duration`; no registramos el SQL.
    super({ log: [{ emit: 'event', level: 'query' }] });
  }

  async onModuleInit() {
    // Métrica (US2, FR): usamos los eventos de query de Prisma, no modificamos cada llamada.
    try {
      // `afterQuery` no pasa el tipo de forma limpia con la sobrecarga de logs; usamos un cast.
      (this.$on as unknown as (event: 'afterQuery', cb: (e: { duration?: number }) => void) => void)(
        'afterQuery',
        (event) => {
          const durationMs = event.duration ?? 0;
          this.metrics.recordDbQuery(durationMs / 1000);
        },
      );
    } catch {
      // Si por cualquier razón no se pueden registrar eventos, la app sigue sin métricas de DB.
    }

    // Span anidado (SC-001, FR-001): una "db.query" bajo el span activo de la request, para
    // completar el tree middleware → controller → service → DB (antes solo se alimentaba la métrica).
    this.installQuerySpanMiddleware();

    await this.$connect();
  }

  /**
   * Crea un span hijo `db.query` alrededor de cada operación de Prisma mediante la middleware de
   * query (`$use`). El span se anida bajo el span activo de la request (el que abre el interceptor
   * HTTP / la auto-instrumentación), de modo que cada query aparece como hijo en el mismo trace
   * (SC-001). No se registra el texto del SQL para no filtrar datos sensibles (FR-011).
   *
   * La métrica se sigue alimentando por los eventos `afterQuery` (arriba), así que la middleware
   * solo aporta el span y NO duplica la métrica. Si Prisma depreca/quita `$use`, el aislamiento
   * (try/catch) garantiza que la app siga funcionando sin spans de DB (FR-010).
   */
  private installQuerySpanMiddleware(): void {
    try {
      // `$use` está deprecado a favor de la instrumentación por eventos, pero sigue disponible en
      // Prisma 6 y es la forma más limpia de envolver TODAS las operaciones (modelo + raw) con un span.
      // No está en los tipos de `PrismaClient` (deprecado), así que se accede vía un cast aislado.
      const $use = (this as unknown as {
        $use?: (mw: {
          query?: (
            params: { model?: string; operation?: string },
            next: (p: never) => Promise<unknown>,
          ) => Promise<unknown>;
        }) => void;
      }).$use;
      if (typeof $use !== 'function') return;

      $use.call(this, {
        query: async (params, next) => {
          const tracer = trace.getTracer(OTEL_SERVICE_NAME);
          const span = tracer.startSpan('db.query', {
            kind: SpanKind.CLIENT,
            attributes: {
              'db.system': 'postgresql',
              // `model` (p. ej. "User") o `operation` (p. ej. "findMany"); sin el SQL completo.
              'db.operation': params?.model ?? params?.operation ?? 'query',
            },
          });
          try {
            return await next(params as never);
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
            throw err;
          } finally {
            span.end();
          }
        },
      });
    } catch {
      // Aislamiento: un fallo al instalar la middleware no afecta al ciclo de vida de la app.
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
