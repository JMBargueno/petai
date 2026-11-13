# Convergencia: Observabilidad con OpenTelemetry

**Feature**: `003-observabilidad` | **Veredicto**: ⚠️ CONVERGENCIA PARCIAL (conditional pass)

**Alcance**: `spec.md`, `plan.md`, `tasks.md`, `contracts/api-contract.md` + código en `backend/src/observability/`, `main.ts`, `env.config.ts`, `health.controller.ts`, `prisma.service.ts`, `redis.service.ts`, `realtime.gateway.ts`, `app.module.ts`, `Dockerfile`, `package.json`, `docker-compose(.prod).yml` e `infra/observability/*`.

**Resumen ejecutivo**: 36/37 tareas completadas; el núcleo (US1 métricas `/metrics`, US4 logs, US5 dashboards, US6 alertas) está entregado. Pero **no hay convergencia total**: una tarea incompleta (T022), un requisito sin task ni implementación (FR-007) y tres gaps de peso (GC sin `--expose-gc`, sin spans anidados de capas, métrica SSE nunca registrada). Cerrar gaps **High** antes de merge.

---

## 1. Tasks completion check

| ID | Descripción | Estado | Evidencia / observación |
|----|-----------|:------:|--------------------------|
| T001 | Estructura `backend/src/observability/` | ✅ | Carpeta con 8 módulos + 3 specs |
| T002 | Deps `@opentelemetry/*`, `prom-client`, `pino` | ✅ | `package.json`: api, sdk-node, sdk-trace-base, resources, sdk-logs, exporters otlp, semantic-conventions, prom-client, pino, pino-pretty |
| T003 | Validar `OTEL_*` + `METRICS_PORT` | ✅ | `env.config.ts` (SERVICE_NAME/VERSION, EXPORTER_ENDPOINT/PROTOCOL, TRACES_SAMPLER/_ARG, METRICS_EXPORTER, METRICS_PORT) |
| T004 | `otel.constants.ts` | ✅ | service.name=`petai-backend`, buckets, `REDACT_KEYS` |
| T005 | `NodeSDK` antes de `NestFactory.create()` | ✅ | `main.ts` L36-38: `initOtel(...)` antes de `NestFactory.create` |
| T006 | Dev compose: prometheus/grafana/jaeger/alertmanager | ✅ | `docker-compose.yml` servicios + volumes + `petai-net` |
| T007 | Prod compose + `OTEL_*` + sin 9464 | ✅ | `docker-compose.prod.yml`; backend env OTEL_*; solo publica 3000 |
| T008 | `EXPOSE 9464` en Dockerfile | ✅ | `Dockerfile` L27 |
| T009 | `observability.module.ts` (DynamicModule) | ✅ | `forRoot()` registra `MetricsService` + interceptor |
| T010 | Registrar en `app.module.ts` | ✅ | `app.module.ts` L34 `ObservabilityModule.forRoot()` |
| T011 | Aislamiento de fallos | ✅ | `otel-sdk.ts`: `OtlpFallbackExporter` traga errores; `BatchSpanProcessor exportTimeoutMillis:3000`; `try/catch` en helpers |
| T012 | e2e formato Prometheus | ✅ | `observability.e2e-spec.ts` test 2 (200 + `text/plain; version=0.0.4`) |
| T013 | 8 métricas en `metrics.service.ts` | ✅ | `METRIC_NAMES` (8) + histogramas/gauges con buckets |
| T014 | Servidor dedicado `METRICS_PORT` | ✅ | `startServer()` (http aislado, puerto 0 en tests) |
| T015 | Registrar/exportar `MetricsService` | ✅ | `exports:[MetricsService]`, `@Global()` |
| T016 | `GET /v1/health/otel` | ✅ | `health.controller.ts` `otel()` — campos completos |
| T017 | e2e de spans con jerarquía padre/hija | ❌ | **No implementado**: e2e solo comprueba métricas, no genera/verifica spans ni `service.name`; sin collector de test |
| T018 | `otel.interceptor.ts` | ✅ | Span por request, labels method/route/status, `recordException` + 5xx |
| T019 | Interceptor global vía `APP_INTERCEPTOR` | ✅ | `observability.module.ts` L25 |
| T020 | Instrumentar Prisma (DB) | ⚠️ | Alimenta **métrica** vía `afterQuery`; **no crea span hijo** de DB |
| T021 | Instrumentar Redis | ⚠️ | Alimenta **métrica** `recordRedisOperation`; **no crea span hijo** |
| T022 | e2e WebSocket→BullMQ (continuidad traceId) | ❌ | **Sin check** en `tasks.md`; requiere `socket.io-client` devDep (ausente) |
| T023 | `otel-context.ts` | ✅ | `getActiveTraceId/SpanId`, `startSpanFromRemoteTrace`, `withSpan`, validadores |
| T024 | Instrumentar `realtime.gateway.ts` | ⚠️ | Lee `x-trace-id`/`x-span-id`, span de **conexión** + gauge socketio. **SSE nunca se registra** (`recordSseStream` no se llama); sin span "por evento" |
| T025 | `bullmq-trace.ts` | ✅ | `wrapJobPayload`, `processJobWithContext`, `reportQueueDepth` |
| T026 | Gauge `petai_bullmq_queue_depth` desde helper | ✅ | `setBullmqQueueDepth` + `reportQueueDepth` (no-op si BullMQ ausente) |
| T027 | `log-serializer.spec.ts` | ✅ | Spec existe (2.3 KB) |
| T028 | `log-serializer.ts` (customizer + redacción) | ✅ | `otelLogCustomizer` + `redact()` profunda + `buildPinoRedactPaths` |
| T029 | pino en `main.ts` + enlazar requestId | ⚠️ | `createNestLogger` usado; inyecta traceId/spanId. **requestId no se inyecta por defecto**; enlazado débil |
| T030 | `datasource.yaml` + `dashboards.yaml` | ✅ | Provisioning correcto |
| T031 | `overview.json` | ✅ | p95/p50/p99, rps, error rate, memoria, conexiones |
| T032 | `per-endpoint.json` | ✅ | p50/p95/p99 por `route`+`method`, throughput, error |
| T033 | `websocket.json` | ✅ | Conexiones activas, latencia SSE, eventos/s |
| T034 | `bullmq.json` | ✅ | Profundidad, max, jobs/s por cola |
| T035 | `prometheus.yml` | ✅ | Scrape `backend:9464/metrics` 15s, `rule_files`, `alerting` |
| T036 | `alert-rules.yml` (5 reglas) | ✅ | HighLatencyP95, HighErrorRate, BullMQQueueSaturated, ProcessOOMKilled, LongGCPause |
| T037 | `alertmanager.yml` | ✅ | Slack + email + `inhibit_rules` |

**Totales**: 37 → ✅ 30, ⚠️ parcial 4 (T020, T021, T024, T029), ❌ 2 (T017, T022).
**Requisito sin task**: **FR-007** (sub-checks de `/health` db/redis/bullmq) sin tarea ni implementación (ver §2/§3).

---

## 2. Acceptance criteria check (SC del spec)

| SC | Criterio | Estado | Observación |
|----|----------|:------:|-------------|
| SC-001 | 100% requests REST → trace con spans middleware→controller→service→DB→response | ⚠️ | Existe **un span por request** (interceptor) con `service.name`. Pero **no hay spans anidados** de capas: sin `@opentelemetry/auto-instrumentations-node`/`instrumentation-http` (count=0) y DB/Redis solo alimentan métricas, no spans. El tree prometido no se genera. |
| SC-002 | `/metrics` expone 8 métricas <5 ms | ✅ | Verificado por e2e; servidor dedicado y registro propio. |
| SC-003 | ≥95% eventos WS + jobs BullMQ correlacionados con traceId origen | ⚠️ | Propagación WS usa **span links** (`trace.ancestors`) → **trace nuevo enlazado**, no span hijo del mismo traceId. BullMQ hereda `traceId` en payload pero aún no integrado. "Continuidad de trace" no garantizada. |
| SC-004 | 100% líneas de log con traceId + spanId | ⚠️ | Path Nest Logger (`PinoNestLogger.emit`) inyecta traceId/spanId y redacta. `console.warn` de `otel-sdk.ts` y pino directo NO; `requestId` no se inyecta por defecto. |
| SC-005 | 4 dashboards con datos en tiempo real <15 s | ⚠️ | 4 dashboards existen y refieren métricas correctas. En **dev no hay servicio `backend`** → scrape target `backend:9464` no resuelve; no pinta datos en dev tal como está. |
| SC-006 | Alertas fiables ante anomalías | ⚠️ | Reglas latencia/errores/BullMQ correctas. **LongGCPause no dispara** (sin `--expose-gc`); **ProcessOOMKilled** usa `container_oom_events_total` (cAdvisor ausente). BullMQ sin datos. |
| SC-007 | Overhead <5% CPU vs baseline | ❌ | Sin benchmark ni baseline; no verificable. |
| SC-008 | Fallo de observabilidad no degrada >5% en 1000 requests | ❌ | Diseño aísla fallos, pero **sin prueba de carga** que lo demuestre. |

**Resumen**: 1✅, 5⚠️, 2❌.

---

## 3. API contract check

| Contrato | Estado | Observación |
|----------|:------:|-------------|
| 8 métricas (nombre/labels/tipo) | ✅ | Coinciden con §1: http(method/route/status, hist), db(hist), redis(command, hist), socketio(gauge), bullmq(queue, gauge), sse(stream_type, hist), memory(gauge), gc(hist). |
| Content-Type `text/plain; version=0.0.4; charset=utf-8` | ✅ | `CONTENT_TYPE` exacto en `metrics.service.ts`. |
| `GET /v1/health/otel` (ok y degradado) | ✅ | Devuelve `enabled, exporter, exporter_endpoint, traces_exporting, metrics_exporting, logs_exporting, sampling_rate, active_traces_in_buffer, last_export_timestamp, last_export_error` + `status/uptime/version`. |
| `GET /v1/health` sub-checks (FR-007) `checks{db,redis,bullmq}` + `uptime`/`version` | ❌ | **No coincide**: `live()` → `{status:'ok'}`; `ready()` → `{status, database, redis}`. Sin `checks` db/redis/bullmq, sin `latency_ms`, sin `active_workers`, sin `uptime`/`version` en `/health`. |
| Docker services (dev/prod) | ✅ | dev: prometheus/grafana/jaeger/alertmanager; prod: prometheus/grafana/alertmanager + backend OTEL_*. 9464 no expuesto. **Gap dev**: sin `backend` → scrape no resuelve. |
| 5 reglas PromQL | ✅ | Coinciden con §3 (umbral/for/severity/labels). |
| Alertmanager routing + inhibit | ✅ | Slack + email + `inhibit_rules` critical→warning, igual a §4. |
| Grafana 4 dashboards | ✅ | §5; JSON refieren métricas reales. |
| Propagación WS (`x-trace-id`) | ⚠️ | Se lee `x-trace-id`/`x-span-id`, pero por **link** en vez de padre (ver SC-003). |
| Propagación BullMQ (payload traceId/spanId) | ✅ | `wrapJobPayload` serializa; `processJobWithContext` abre span hijo. |
| Formato log (traceId/spanId + redacción) | ✅ | `log-serializer.ts` inyecta y redacta; `REDACT_KEYS` cubre token/apiKey/authorization/password. |

**Resumen contrato**: 9✅, 1⚠️, 1❌ (FR-007 sub-checks de `/health`).

---

## 4. Constitution compliance

| Artículo | Veredicto | Justificación / matiz |
|----------|:--------:|------------------------|
| I. Backend autoritativo | ✅ PASS | No se toca lógica de negocio ni aleatoriedad; `traceId`/`spanId` son metadatos. |
| II. Combate determinista | ✅ PASS | `engine.ts` sin cambios; observabilidad no altera el motor. |
| III. Contratos / multi-plataforma | ⚠️ PASS (matiz) | Plan alegó endpoints "no expuestos al contrato". `/v1/health/otel` **sí** lleva `@ApiTags/@ApiOperation` y aparecerá en `shared/openapi/openapi.json`. `/metrics` queda fuera (correcto). Riesgo bajo, pero es un cambio de contrato público que debe documentarse. |
| IV. Lazy Tick | ✅ PASS | Sin cron/job; spans/métricas pasivos. |
| V. Datos de juego inmutables | ✅ PASS | Sin cambios en `shared/game-data/*.json`. |
| VI. Monorepo pnpm | ✅ PASS | Deps en `backend/package.json`; sin nuevo workspace. |
| VII. Entorno validado | ✅ PASS | Zod valida `OTEL_*`; sin endpoint el SDK se desactiva de forma segura (`OTEL_EXPORTER_OTLP_ENDPOINT` opcional) → prod no arrumba. |
| VIII. Seguridad | ✅ PASS | 9464 no expuesto; redacción de secrets/PII en logs; el gateway no loguea el JWT ni lo mete en span; interceptor solo expone method/route/status/requestId. |
| IX. Simplicidad primero | ✅ PASS | Un módulo `backend/src/observability/`; sin microservicio. |

**Total**: 8 PASS + 1 PASS con matiz (III). Sin violaciones bloqueantes.

---

## 5. Gaps found (priorizados)

**HIGH**
- **G1 — FR-007 sin implementar ni rastreado.** `/v1/health` no expone sub-checks `db/redis/bullmq` + `uptime`/`version` (contrato §1). No existe task para este requisito.
- **G2 — Métrica GC no funcional.** `petai_gc_pause_seconds` depende de `PerformanceObserver('gc')`/`collectDefaultMetrics`, que requieren `--expose-gc`. `Dockerfile` y `start:prod` **no** lo pasan → histograma GC vacío y `LongGCPause` nunca dispara (SC-006).
- **G3 — Sin spans anidados por capa (FR-001 / US2 / SC-001).** Sin instrumentaciones HTTP ni spans hijos de middleware/controller/service/DB; Prisma/Redis solo registran métricas. El "tree de spans" no existe; e2e (T017) no lo verifica.

**MEDIUM**
- **G4 — T022 incompleta.** e2e de continuidad WS→BullMQ no escrito; `socket.io-client` no es devDep.
- **G5 — Métrica SSE nunca registrada.** `petai_sse_stream_duration_seconds` se define (helper `recordSseStream`) pero **nadie la llama** → serie vacía (T024 parcial; afecta SC-005/dashboards websocket).
- **G6 — Propagación por link en vez de hijo.** WS y BullMQ usan `links` (`trace.ancestors`) → trace nuevo enlazado, no span bajo el traceId de origen. Contradice "mismo traceId / misma cadena de trace" (US3, SC-003). Opción válida, pero debe documentarse o cambiarse a `setSpan`.

**LOW**
- **G7 — requestId↔traceId débil.** `requestId` no se inyecta por defecto en logs; `console.warn` de `otel-sdk.ts` queda fuera de correlación.
- **G8 — Dev sin `backend` en compose.** Scrape `backend:9464` no resuelve en dev; US1/US5 no demostrables tal como están.
- **G9 — OOM sin cAdvisor.** `ProcessOOMKilled` depende de `container_oom_events_total` (cAdvisor ausente) → alerta inerte.
- **G10 — Config muerta.** `OTEL_TRACES_SAMPLER` y `OTEL_METRICS_EXPORTER` validados pero no usados (sampler hardcodeado; métricas vía prom-client).
- **G11 — SC-007/SC-008 sin evidencia.** Sin benchmark de overhead ni prueba de 1000 requests con exportador caído.
- **G12 — Imagen Node 22 vs plan Node 24.** `Dockerfile` `node:22-slim` / `@types/node` 22; plan/constitución hablan de Node 24 (inconsistencia preexistente, bajo impacto).

---

## 6. Recommended fixes

1. **G1 (FR-007)**: Añadir en `health.controller.ts` un endpoint (o enriquecer `ready()`/`live()`) que devuelva `{ status, checks:{ db:{status,latency_ms}, redis:{status,latency_ms}, bullmq:{status,active_workers} }, uptime, version }` según contrato §1. **Crear una task** para FR-007. Alternativa: alinear el contrato §1 con el `ready()` actual (recomendado: alinear con el contrato).
2. **G2 (GC)**: Añadir `--expose-gc` → `Dockerfile` `CMD [...] node --expose-gc dist/src/main` y `package.json` `"start:prod":"node --expose-gc dist/src/main"`. Verificar `petai_gc_pause_seconds_bucket` en `/metrics` y que `LongGCPause` dispare.
3. **G3 (spans anidados)**: Opción A: instalar `@opentelemetry/auto-instrumentations-node` y crear spans hijos de DB/Redis bajo `getActiveSpan()`. Opción B: documentar "un span por request" y ajustar US2/SC-001. Actualizar **T017** para exportar a un collector de test y afirmar `service.name` + jerarquía.
4. **G4 (T022)**: Añadir `socket.io-client` a `devDependencies` y completar el e2e: handshake con `x-trace-id` → job con mismo contexto; sin `x-trace-id` → nuevo trace.
5. **G5 (SSE)**: Llamar a `metrics.recordSseStream(streamType, secs)` donde emita el stream, o documentar/defersar T024 hasta que exista streaming SSE.
6. **G6 (propagación)**: Para "mismo traceId", usar `setSpan` como contexto padre (span hijo) en vez de `links`; o conservar `links` y redactar US3/SC-003 como "correlación por link".
7. **G7 (requestId)**: Inyectar `requestId` por petición en el logger pino para que el log lleve `requestId` ligado a `traceId` (SC-004).
8. **G8 (dev)**: Añadir un servicio `backend` a `docker-compose.yml` (o documentar scraping vía `host.docker.internal`).
9. **G9 (OOM)**: Añadir `cAdvisor` a los compose, o sustituir la regla por otra señal disponible en compose puro.
10. **G10/G11**: Conectar o eliminar `OTEL_TRACES_SAMPLER`/`OTEL_METRICS_EXPORTER`; añadir benchmark mínimo (SC-007) y prueba de 1000 requests con exportador caído (SC-008).

---

## Veredicto final

**Convergencia parcial.** El feature cubre de forma sólida US1 (métricas), US4 (logs), US5 (dashboards) y US6 (alertas, con matices), y respeta la constitución (8/9 + 1 matiz). **No se declara convergido** hasta cerrar, como mínimo, los gaps **High**: **G1 (FR-007 + task), G2 (`--expose-gc`) y G3 (spans anidados)** — todos afectan criterios de aceptación (SC-001, SC-005/006, contrato §1). Los gaps MEDIUM (T022, SSE, propagación por link) y LOW deben programarse o documentarse como desviación aceptada.