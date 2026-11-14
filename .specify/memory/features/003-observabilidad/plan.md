# Implementation Plan: Observabilidad con OpenTelemetry

**Branch**: `003-observabilidad` | **Date**: 2026-03-25 | **Spec**: [`spec.md`](./spec.md)

**Input**: Feature specification from `/specify/memory/features/003-observabilidad/spec.md`

## Summary

Instrumentar el backend NestJS de PetAI con OpenTelemetry para lograr **trazabilidad distribuida end-to-end** (REST → auth middleware → controller → service → Prisma → Redis → Socket.IO → BullMQ), **métricas de rendimiento expuestas en Prometheus** (`GET /metrics` puerto 9464), **logs correlacionados por `traceId`**, **dashboards Grafana** (4 paneles) y **alertas automáticas** ante anomalías de latencia, errores y colas saturadas.

**Enfoque técnico**: El SDK de OpenTelemetry (`@opentelemetry/sdk-node`) se inicializa en `main.ts` antes del `NestFactory.create()`. Un `NestInterceptor` global captura spans por request HTTP. `prom-client` expone las 8 métricas en un segundo HTTP server dedicado al puerto 9464 (aislado del servidor principal 3000). La propagación de contexto a WebSocket se realiza pasándola en el handshake (`x-trace-id`); a BullMQ, serializando `traceId` en el job payload. Los logs (pino) se enriquecen con un customizer que inyecta `traceId`/`spanId` del contexto activo. Prometheus + Grafana + Alertmanager se añaden como servicios en `docker-compose.yml` y `docker-compose.prod.yml`.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS

**Primary Dependencies**:
- `@opentelemetry/api` — API pública de spans y contexto
- `@opentelemetry/sdk-node` — SDK completo (traces, metrics, logs)
- `@opentelemetry/semconv` — atributos estándar
- `@opentelemetry/exporter-trace-otlp-grpc` — exportador gRPC (fallback HTTP)
- `@opentelemetry/exporter-metrics-otlp-http` — exportador de métricas
- `@opentelemetry/sdk-logs` + `@opentelemetry/exporter-logs-otlp-http` — pipeline de logs
- `@opentelemetry/resources` — `service.name` / `service.version`
- `prom-client` — exposición de métricas en formato Prometheus (`/metrics`)
- `pino` + `pino-pretty` — estructurador de logs con correlación

**Storage**:
- PostgreSQL 18 (persistencia principal — sin cambios de schema)
- Redis 8 (colas BullMQ, sesión — sin cambios)
- **Prometheus** (nuevo — scrapea `:9464/metrics` cada 15 s)
- **Grafana** (nuevo — dashboards y datasource Prometheus)
- Jaeger (desarrollo — backend de traces) / Grafana Tempo o Cloud (producción)

**Testing**: Jest (unit) + Supertest (e2e contra Postgres/Redis de docker-compose)

**Target Platform**: Linux server (Docker) — `node:24-slim`

**Project Type**: web-service

**Performance Goals**: Overhead de instrumentación < 5 ms por request; endpoint `/metrics` responde en < 5 ms bajo tráfico normal; p95 de la app NO degrada > 5% vs. baseline sin OTel.

**Constraints**:
- Debe funcionar en **dev** (`docker-compose.yml`) y **prod** (`docker-compose.prod.yml`).
- El puerto 9464 (métricas) NO se expone al host públicamente; solo red interna Docker.
- Fallos del exportador OTLP o de Prometheus NO degradan ni bloquean la ruta crítica (batch processor con timeout acotado, sin reintentos síncronos).
- Redacción obligatoria: API keys, tokens JWT y PII NO aparecen en logs, spans ni métricas.
- Sampling de traces en producción: 10–20% para controlar cardinalidad.
- OTLP por gRPC con fallback a HTTP.

**Scale/Scope**: 10 000 usuarios concurrentes; 8 series métricas principales; 4 dashboards Grafana; 5 reglas de alerta PromQL; ~15 paquetes OTel añadidos a `package.json`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Artículo | Veredicto | Justificación |
|----------|-----------|---------------|
| **I. Backend autoritativo** | ✅ PASS | La observabilidad no modifica lógica de negocio ni aleatoriedad. El `traceId`/`spanId` son metadata, no datos de juego. No se toman decisiones de estado a partir de métricas. |
| **II. Combate determinista** | ✅ PASS | El motor de combate (`engine.ts`) no se modifica. Los spans de la ruta de batalla son decorativos (observan, no alteran). El PRNG y el orden fijo de llamadas se preservan. |
| **III. Consistencia multi-plataforma** | ✅ PASS | El contrato OpenAPI (`openapi.json`) se mantiene intacto. Los nuevos endpoints (`/metrics`, extensión de `/health`) son de infraestructura y no se exponen al contrato de la API pública del cliente. |
| **IV. Lazy Tick** | ✅ PASS | No se introduce ningún cron ni job periódico para el tick. Los spans/métricos son pasivos. |
| **V. Datos de juego inmutables** | ✅ PASS | No se modifican `shared/game-data/*.json`. |
| **VI. Monorepo pnpm** | ✅ PASS | Se añade en `backend/package.json`; no se introduce nuevo workspace. |
| **VII. Entorno validado** | ✅ PASS | Las variables de OTel (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, etc.) se validan con Zod en `env.config.ts`. En producción, si faltan, el proceso arranca con valores por defecto seguros (no exporta); nunca falla por falta de endpoint de traces. |
| **VIII. Seguridad** | ✅ PASS | El puerto 9464 NO se expone al host (solo red interna Docker). Los tokens JWT, API keys y PII se redactan en logs/spans. El endpoint de métricas no lleva auth pero es inaccesible desde fuera de la red Docker. |
| **IX. Simplicidad primero** | ✅ PASS | No se añade infraestructura que ninguna fase no use. Prometheus + Grafana + Alertmanager son necesarios desde el momento de instrumentar. No se crea un microservicio adicional: todo vive en `backend/src/observability/`. |

**Resultado**: **9/9 artículos PASS**. Sin violaciones. No se requiere sección de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/003-observabilidad/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output (pendiente)
├── data-model.md        # Phase 1 output (pendiente)
├── quickstart.md        # Phase 1 output (pendiente)
├── contracts/
│   └── api-contract.md  # Contratos de endpoints, servicios y alertas
└── tasks.md             # Phase 2 output (pendiente — /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── main.ts                        # [MODIFIED] Inicializa NodeSDK antes de NestFactory.create
│   ├── config/
│   │   └── env.config.ts              # [MODIFIED] Valida vars OTEL_*, METRICS_PORT
│   └── observability/                 # [NEW MODULE]
│       ├── observability.module.ts    # DynamicModule: registra interceptor, metrics service
│       ├── otel.interceptor.ts        # NestInterceptor: genera span por request
│       ├── metrics.service.ts         # prom-client: define las 8 métricas, HTTP :9464
│       ├── otel-context.ts            # Utilidades: getActiveTraceId(), propagateToWebSocket()
│       ├── log-serializer.ts          # Pino customizer: inyecta traceId/spanId, redacta
│       ├── health.controller.ts       # [EXTENDED] GET /v1/health/otel — OTEL status
│       └── otel.constants.ts          # service.name, resource attrs, bucket thresholds
│
├── test/
│   └── observability.e2e-spec.ts      # [NEW] e2e: /metrics formato, /health/otel
│
├── Dockerfile                         # [MODIFIED] EXPOSE 9464
└── package.json                       # [MODIFIED] +deps OTel + prom-client + pino

# Root — infraestructura de observabilidad (nuevos)
docker-compose.yml                     # [MODIFIED] + prometheus, grafana, jaeger, alertmanager
docker-compose.prod.yml                # [MODIFIED] + prometheus, grafana, alertmanager

infra/observability/
├── prometheus/
│   ├── prometheus.yml                 # Scrape config: backend:9464 / 15s
│   └── alert-rules.yml                # 5 reglas PromQL
├── grafana/
│   ├── datasource.yaml                # Datasource Prometheus
│   └── dashboards/
│       ├── overview.json
│       ├── per-endpoint.json
│       ├── websocket.json
│       └── bullmq.json
└── alertmanager/
    └── alertmanager.yml               # Routing Slack/email
```

**Structure Decision**: Single module (`backend/src/observability/`) dentro del backend existente. No se crea un microservicio separado — los datos son in-proc (spans, métricas, logs) y el único componente externo es el servidor de métricas `prom-client` que escucha en el puerto 9464 del mismo proceso. La infraestructura de almacenamiento vive en `infra/observability/`.

## Complexity Tracking

> No aplicable — la Constitution Check no identificó violaciones que requieran justificación.
