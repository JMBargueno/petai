/**
 * Módulo de observabilidad (T009, T015, T019).
 *
 * `DynamicModule` global que registra:
 *  - `MetricsService` (expuesto para que interceptor, Prisma, Redis, WebSocket y BullMQ lo usen).
 *  - `OtelHttpInterceptor` como interceptor GLOBAL (`APP_INTERCEPTOR`), de forma no invasiva.
 *
 * Es `@Global()` para que las métricas estén disponibles en cualquier módulo sin importar el
 * `ObservabilityModule` explícitamente (evita acoplar Prisma/Redis/Salud al módulo de obs).
 */
import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { OtelHttpInterceptor } from './otel.interceptor';

@Global()
@Module({})
export class ObservabilityModule {
  static forRoot(): DynamicModule {
    return {
      module: ObservabilityModule,
      providers: [
        MetricsService,
        OtelHttpInterceptor,
        { provide: APP_INTERCEPTOR, useClass: OtelHttpInterceptor },
      ],
      exports: [MetricsService],
    };
  }
}
