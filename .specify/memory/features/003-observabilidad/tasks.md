---

description: "Task list for 003-observabilidad implementation"
---

# Tasks: Observabilidad con OpenTelemetry

**Input**: Design documents from `.specify/memory/features/003-observabilidad/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), contracts/api-contract.md

**Tests**: Solo se incluyen tareas de test donde el feature lo exige (e2e de `/metrics`, correlación por `traceId`, redacción de secrets). No se exige cobertura exhaustiva.

**Organization**: Las tareas se agrupan por user story para que cada historia pueda implementarse, testearse y entregarse de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: A qué user story pertenece la tarea (US1, US2, US3, US4, US5, US6)
- Se incluyen rutas de archivo exactas en la descripción

## Path Conventions

- **Backend NestJS**: `backend/src/`, `backend/test/`
- **Infra de observabilidad**: `infra/observability/` (prometheus, grafana, alertmanager)
- **Composición**: `docker-compose.yml` (dev), `docker-compose.prod.yml` (prod)
- Ajustado a la estructura real de `plan.md` y al código existente en `backend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estructura base del módulo de observabilidad y dependencias

- [x] T001 Crear la estructura del módulo `backend/src/observability/` (carpeta vacía) según `plan.md`
- [x] T002 [P] Añadir a `backend/package.json` las dependencias `@opentelemetry/*` (api, sdk-node, sdk-trace-base, resources, exporter-trace-otlp-grpc, exporter-metrics-otlp-http, sdk-logs, exporter-logs-otlp-http, semconv), `prom-client` y `pino`; ejecutar `pnpm install`
- [x] T003 [P] Extender `backend/src/config/env.config.ts` para validar `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` y `METRICS_PORT` (9464 por defecto)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura core que DEBE estar completa antes de que cualquier user story pueda implementarse

**⚠️ CRITICAL**: Ningún trabajo de user story puede comenzar hasta que esta fase esté completa

- [x] T004 [P] Crear `backend/src/observability/otel.constants.ts`: constantes `service.name="petai-backend"`, atributos de recurso, umbrales de buckets de histograma y lista de claves a redactar (`token`, `apiKey`, `authorization`, `password`)
- [x] T005 Inicializar `NodeSDK` en `backend/src/main.ts` ANTES de `NestFactory.create()`: Resource, BatchSpanProcessor con timeout acotado, sampler `parentbased_traceidratio` (1.0 en dev) y exportador OTLP gRPC con fallback HTTP (FR-014, FR-015)
- [x] T006 [P] Añadir a `docker-compose.yml` los servicios `prometheus`, `grafana`, `jaeger` y `alertmanager` + sus `volumes` (según sección 2 de `contracts/api-contract.md`) en la red `petai-net`
- [x] T007 [P] Añadir a `docker-compose.prod.yml` los servicios `prometheus`, `grafana`, `alertmanager`, los `volumes` y las variables `OTEL_*`/`METRICS_PORT` al servicio `backend`; NO exponer el puerto 9464 al host (FR-012)
- [x] T008 [P] Añadir `EXPOSE 9464` a `backend/Dockerfile` (junto al `EXPOSE 3000`)
- [x] T009 Crear `backend/src/observability/observability.module.ts`: `DynamicModule` que registra el `NestInterceptor` y el `MetricsService`
- [x] T010 Registrar `ObservabilityModule` en `backend/src/app.module.ts`
- [x] T011 Configurar aislamiento de fallos (FR-010): `ErrorHandler` en el exportador y timeout del batch processor para que un fallo de exportación NO degrade ni bloque la ruta crítica

**Checkpoint**: Fundación lista — puede comenzar la implementación de user stories en paralelo

---

## Phase 3: User Story 1 - Ver métricas de rendimiento en tiempo real en `/metrics` (Priority: P1) 🎯 MVP

**Goal**: Exponer las 8 métricas del backend en `GET /metrics` (puerto 9464) en formato Prometheus text exposition

**Independent Test**: Iniciar el backend y llamar a `GET /metrics` en el puerto 9464; verificar `200` con las series `petai_http_request_duration_seconds`, `petai_db_query_duration_seconds`, `petai_redis_operation_duration_seconds`, `petai_socketio_active_connections`, `petai_bullmq_queue_depth`, `petai_sse_stream_duration_seconds`, `petai_memory_heap_used_bytes` y `petai_gc_pause_seconds`

### Tests for User Story 1

> **NOTE: Escribir estos tests PRIMERO, asegurar que FALLAN antes de la implementación**

- [x] T012 [P] [US1] Test e2e del formato Prometheus en `backend/test/observability.e2e-spec.ts`: llamar a `GET /metrics` (9464) y verificar `200`, `Content-Type: text/plain; version=0.0.4` y la presencia de las 8 series

### Implementation for User Story 1

- [x] T013 [US1] Crear `backend/src/observability/metrics.service.ts` con `prom-client`: registrar las 8 métricas (histogramas con buckets acotados y gauges) según `contracts/api-contract.md` §1
- [x] T014 [US1] En el mismo `metrics.service.ts`, levantar un servidor HTTP dedicado en `METRICS_PORT` (9464) que sirva `/metrics` con `defaultMetrics` y registrar los collectors de memoria/GC (`process.memoryUsage()`, GC pauses)
- [x] T015 [US1] Registrar el `MetricsService` en `observability.module.ts` y exponerlo para uso por el interceptor y los hooks de WebSocket/BullMQ
- [x] T016 [US1] Añadir el endpoint extendido `GET /v1/health/otel` en `backend/src/modules/health/health.controller.ts` (estado del exporter: `enabled`, `exporter`, `traces_exporting`, `metrics_exporting`, `logs_exporting`, `sampling_rate`, `active_traces_in_buffer`, `last_export_error`) según `api-contract.md` §1

**Checkpoint**: MVP listo — US1 verificable de forma aislada

---

## Phase 4: User Story 2 - Trazar una request REST de punta a punta (Priority: P2)

**Goal**: Que cada request REST genere un trace OTel con spans anidadas (middleware auth → controller → service → DB → response)

**Independent Test**: Enviar `GET /pets` con Bearer token válido y verificar en Jaeger un trace con span padre (middleware) y spans hijas (controller, service, query PostgreSQL), todas bajo el mismo `traceId`

### Tests for User Story 2

- [x] T017 [P] [US2] Test e2e en `backend/test/observability.e2e-spec.ts`: tras una request, verificar que se generan spans con `service.name="petai-backend"` y jerarquía padre/hija (exportar a un collector de test o Jaeger)

### Implementation for User Story 2

- [x] T018 [P] [US2] Crear `backend/src/observability/otel.interceptor.ts`: `NestInterceptor` que abre un span por request con labels `method`/`route`/`status` y marca `status error` en excepciones
- [x] T019 [US2] Aplicar el interceptor globalmente vía token `APP_INTERCEPTOR` en `observability.module.ts`
- [x] T020 [P] [US2] Instrumentar queries a PostgreSQL en `backend/src/prisma/prisma.service.ts` para alimentar `petai_db_query_duration_seconds`
- [x] T021 [P] [US2] Instrumentar operaciones Redis en `backend/src/redis/redis.service.ts` para alimentar `petai_redis_operation_duration_seconds` (label `command`)

**Checkpoint**: US2 verificable de forma aislada

---

## Phase 5: User Story 3 - Correlar un evento WebSocket que dispara un job BullMQ (Priority: P3)

**Goal**: Propagar el `traceId` del handshake de Socket.IO al handler del evento y a los jobs BullMQ para reconstruir el flujo REST → WebSocket → job

**Independent Test**: Emitir un evento WebSocket que encolue un job BullMQ y verificar que el span del gateway lleva el `traceId` del handshake (`x-trace-id`) y que el worker procesa el job bajo el mismo `traceId`

### Tests for User Story 3

- [ ] T022 [P] [US3] Test e2e en `backend/test/observability.e2e-spec.ts`: conectar Socket.IO pasando `x-trace-id`, disparar un evento que encolue un job y verificar la continuidad del `traceId` hasta el worker (caso sin `x-trace-id` → nuevo trace) — pendiente: requiere `socket.io-client` como dependencia de dev

### Implementation for User Story 3

- [x] T023 [P] [US3] Crear `backend/src/observability/otel-context.ts`: utilidades `getActiveTraceId()`, `getActiveSpanId()` y `propagateToWebSocket()`
- [x] T024 [US3] Instrumentar `backend/src/modules/realtime/realtime.gateway.ts`: leer `x-trace-id` en el handshake, crear span hijo por evento y actualizar el gauge `petai_socketio_active_connections` y `petai_sse_stream_duration_seconds` (label `stream_type`)
- [x] T025 [P] [US3] Crear `backend/src/observability/bullmq-trace.ts`: serializar `traceId`/`spanId` en el payload del job al encolar y generar spans hijos en el processor al procesar (reutilizable cuando se añada BullMQ en Feature #1/#2)
- [x] T026 [US3] Alimentar el gauge `petai_bullmq_queue_depth` (label `queue`) en `metrics.service.ts` desde el helper `bullmq-trace.ts` (sin fallar si BullMQ aún no está inicializado)

**Checkpoint**: US3 verificable de forma aislada

---

## Phase 6: User Story 4 - Buscar un traceId en los logs y ver la request completa (Priority: P4)

**Goal**: Que cada línea de log (pino) incluya `traceId` y `spanId` del contexto activo y redacte secrets/PII

**Independent Test**: Enviar una request y buscar su `traceId` en los logs; verificar que todas las líneas (auth, controller, service, DB) incluyen el mismo `traceId` y un `spanId`, en el formato `{ timestamp, level, message, traceId, spanId, requestId, ... }`

### Tests for User Story 4

- [x] T027 [P] [US4] Test unitario `backend/src/observability/log-serializer.spec.ts`: verificar la inyección de `traceId`/`spanId` y la redacción de `token`/`apiKey`/`authorization`/`password` a `"[REDACTED]"`

### Implementation for User Story 4

- [x] T028 [P] [US4] Crear `backend/src/observability/log-serializer.ts`: customizer de pino que inyecta `traceId`/`spanId` del contexto activo y aplica redacción obligatoria de secrets/PII (FR-006, FR-011)
- [x] T029 [US4] Configurar el logger pino en `backend/src/main.ts` / `observability.module.ts` usando `log-serializer.ts` y enlazar el `requestId` existente al `traceId`

**Checkpoint**: US4 verificable de forma aislada

---

## Phase 7: User Story 5 - Ver los dashboards de observabilidad en Grafana (Priority: P5)

**Goal**: Configurar 4 dashboards Grafana (Overview, Per-endpoint, WebSocket, BullMQ) sobre Prometheus

**Independent Test**: Abrir Grafana con Prometheus como datasource y verificar que los 4 dashboards pintan datos reales tras unos ciclos de scrape de 15 s

### Implementation for User Story 5

- [x] T030 [P] [US5] Crear `infra/observability/grafana/datasource.yaml` (datasource Prometheus) y `infra/observability/grafana/dashboards/dashboards.yaml` (provider de provisioning)
- [x] T031 [P] [US5] Crear `infra/observability/grafana/dashboards/overview.json` (p95 global, throughput req/s, error rate %, CPU/RAM, conexiones activas)
- [x] T032 [P] [US5] Crear `infra/observability/grafana/dashboards/per-endpoint.json` (p50/p95/p99 por `route`+`method`, throughput y error rate por ruta)
- [x] T033 [P] [US5] Crear `infra/observability/grafana/dashboards/websocket.json` (conexiones activas, eventos/s, latencia SSE, disconnects/s)
- [x] T034 [P] [US5] Crear `infra/observability/grafana/dashboards/bullmq.json` (profundidad por cola, tiempo de espera, jobs/s, jobs failed)

**Checkpoint**: US5 verificable de forma aislada

---

## Phase 8: User Story 6 - Recibir alertas automáticas ante anomalías (Priority: P6)

**Goal**: Configurar reglas de alerta Prometheus + routing de Alertmanager (Slack/email) para latencia, errores, colas saturadas, OOM y GC

**Independent Test**: Simular cada condición (p95 > 200 ms 5 min, error > 1% 3 min, BullMQ > 1000, GC > 500 ms, OOM) y verificar que Prometheus/Alertmanager dispara la regla y notifica al canal configurado

### Implementation for User Story 6

- [x] T035 [P] [US6] Crear `infra/observability/prometheus/prometheus.yml` (scrape de `backend:9464/metrics` cada 15 s, `rule_files`, `alerting`) según `api-contract.md` §2.1
- [x] T036 [P] [US6] Crear `infra/observability/prometheus/alert-rules.yml` con las 5 reglas PromQL (HighLatencyP95, HighErrorRate, BullMQQueueSaturated, ProcessOOMKilled, LongGCPause) según `api-contract.md` §3
- [x] T037 [P] [US6] Crear `infra/observability/alertmanager/alertmanager.yml` con routing a Slack/email e `inhibit_rules` según `api-contract.md` §4

**Checkpoint**: US6 verificable de forma aislada

---

## Phase 9: Post-convergencia — FR-007 sub-checks de `GET /health` (Priority: P1)

**Goal**: FR-007 exige enriquecer el endpoint `GET /health` con sub-checks por componente (`db`, `redis`, `bullmq`) devolviendo el estado por componente además de `uptime` y `version` (gap G1: requisito sin task ni implementación)

**Independent Test**: Llamar a `GET /v1/health` y `GET /v1/health/ready`; verificar que ambas devuelven `{ status, checks: { db: {status, latency_ms}, redis: {status, latency_ms}, bullmq: {status, active_workers} }, uptime, version }` según `api-contract.md` §1 (sub-checks de `/v1/health`)

- [x] T038 [P] [FR-007] Enriquecer `backend/src/modules/health/health.controller.ts` con sub-checks por componente (`db` vía `SELECT 1`, `redis` vía `PING`, `bullmq` in-proceso) + `uptime` + `version` en `GET /health` y `GET /health/ready`; `db` crítico → 503 si está caído. Actualizar `backend/test/health.e2e-spec.ts` para afirmar el nuevo formato