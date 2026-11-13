# Spec: Observabilidad con OpenTelemetry

## ID
Feature #3 de la lista de 33 funcionalidades — Oleada 1 "Ops, debugging"

## Resumen
Instrumentación completa del backend PetAI con OpenTelemetry (tracing distribuido, métricas Prometheus, logs correlacionados), dashboards en Grafana, y sistema de alertas con anomaly detection para detectar degradaciones de latencia, errores y colas saturadas automáticamente.

## Contexto
El backend PetAI opera con NestJS + PostgreSQL + Redis + Socket.IO (WebSocket) y está a punto de escalar a producción. Actualmente no hay visibilidad de rendimiento: sin tracing distribuido, sin métricas de latencia p95/p99, sin correlación de logs entre request REST y job en cola. Cualquier incidente en producción sería un "fuego a ciegas". Esta feature es prerrequisito para escalar y operar con confianza.

Conecta con: el gateway WebSocket (Socket.IO), el sistema de rate limiting en Redis, los jobs async (BullMQ, que se añade con Feature #1/#2), y el sistema de IA (SSE streaming).

## Objetivos
- Trazabilidad completa: cada request (REST, WebSocket, job BullMQ) tiene un trace correlacionado.
- Métricas de rendimiento en tiempo real (p50/p95/p99 de latencia, throughput, error rate).
- Alertas automáticas ante anomalías: latencia p95 > +20% en 5min, error rate > 1%, cola BullMQ > 1000.
- Correlación de logs con traceId para debugging de incidentes.

## User Stories
- Como DevOps, quiero ver un dashboard con p95/p99 de latencia por endpoint para detectar degradaciones.
- Como DevOps, quiero una alerta cuando el error rate supere 1% en 5 minutos.
- Como desarrollador, quiero poder buscar un traceId en los logs y ver toda la request end-to-end.
- Como desarrollador, quiero ver el tracing distribuido de un WebSocket event que dispara un job BullMQ.
- Como desarrollador, quiero ver métricas de consumo de memoria/CPU del backend en tiempo real.

## Criterios de aceptación
- [ ] AC1: Cada request REST genera un OpenTelemetry trace con spans para: middleware auth → controller → service → DB query → response.
- [ ] AC2: Cada evento WebSocket genera un span que se correlaciona con la request que lo originó (via traceId en el handshake).
- [ ] AC3: Cada job BullMQ que se procesa hereda el traceId del job original (trace context propagation).
- [ ] AC4: Las métricas Prometheus se exponen en `/metrics` (port 9464) y incluyen: request latency histogram (por route/method), DB query duration, Redis operation duration, Socket.IO connections active, BullMQ queue depth, SSE stream duration.
- [ ] AC5: Los logs (winston/pino) incluyen el `traceId` y `spanId` en cada línea, permitiendo correlación en Grafana.
- [ ] AC6: Dashboards Grafana configurados: (a) Overview (latencia, throughput, errores, CPU/RAM), (b) Per-endpoint (p50/p95/p99 por ruta), (c) WebSocket (conexiones, eventos/s, latencia SSE), (d) BullMQ (depth, wait time, processing time).
- [ ] AC7: Alertas configuradas en Prometheus/Alertmanager: p95 > 200ms sostenido 5min, error rate > 1% en 3min, BullMQ depth > 1000, OOM kill, GC pause > 500ms.
## Diseño técnico
### Backend
- **Paquetes a añadir:**
  - `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-grpc`
  - `@opentelemetry/exporter-metrics-otlp-grpc`
  - `@opentelemetry/exporter-logs-otlp-grpc`
  - `@opentelemetry/instrumentation-nestjs-core` (auto-instrumenta NestJS)
  - `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-pg`
  - `@opentelemetry/instrumentation-redis` (ioredis)
  - `@opentelemetry/instrumentation-socket-io`
  - `prom-client` (exporter Prometheus para el port 9464)
  - `@opentelemetry/sdk-logs`

- **Setup en `main.ts`:**
  ```typescript
  import { NodeSDK } from '@opentelemetry/sdk-node';
  const sdk = new NodeSDK({
    resource: new Resource({ attributes: { 'service.name': 'petai-backend', 'service.version': APP_VERSION } }),
    tracerProvider: new TracerProvider({ spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()) }),
    metricReader: new PeriodicExportingMetricReader(new OTLPMetricExporter(), { exportIntervalMillis: 30000 }),
    logRecordProcessor: new BatchLogRecordProcessor(new OTLPLogExporter())
  });
  sdk.start();
  ```

- **Trace propagation:**
  - REST: automático (middleware NestJS → spans por controller/service/repo).
  - WebSocket: el handler de `@WebSocketGateway()` crea un span con el `traceId` del handshake (se pasa como header `x-trace-id` al conectar Socket.IO).
  - BullMQ: usar `traceContextActiveSpan()` al encolar; el worker hereda el context al procesar.

- **Métricas custom (Prometheus):**
  - `petai_http_request_duration_seconds` (histogram, labels: method, route, status)
  - `petai_db_query_duration_seconds` (histogram, label: query_type)
  - `petai_redis_operation_duration_seconds` (histogram, label: command)
  - `petai_socketio_active_connections` (gauge)
  - `petai_bullmq_queue_depth` (gauge, label: queue_name)
  - `petai_bullmq_job_wait_seconds` (histogram, label: queue_name)
  - `petai_sse_stream_duration_seconds` (histogram, label: endpoint)
  - `petai_memory_heap_used_bytes` (gauge)
  - `petai_gc_pause_seconds` (histogram)

- **Logs (winston + OTel):**
  - Formato: `{ timestamp, level, message, traceId, spanId, requestId, userId, ... }`
  - El `requestId` ya existe en el formato de respuesta; se enlaza al `traceId`.

### Infraestructura (Docker Compose / K8s)
- **Prometheus:** scrapea `:9464/metrics` cada 15s.
- **Grafana:** dashboards pre-configurados (4 panels).
- **Alertmanager:** reglas → webhook a Slack/email.
- **Jaeger** (dev) / **Grafana Tempo** (prod): backend de traces.

## Interfaz de API
### GET /metrics (port 9464, sin auth, solo interno)
- **Response 200:** Formato Prometheus text exposition.
- **Ejemplo:**
```
petai_http_request_duration_seconds_bucket{method="GET",route="/pets",le="0.05"} 142
petai_http_request_duration_seconds_bucket{method="GET",route="/pets",le="0.2"} 198
petai_http_request_duration_seconds_bucket{method="GET",route="/pets",le="+Inf"} 200
petai_socketio_active_connections 42
petai_bullmq_queue_depth{queue="missions:daily-reset"} 3
petai_memory_heap_used_bytes 245760000
```

### GET /health (enriquecido)
- **Response 200:**
```json
{ "status": "ok", "uptime": 86400, "checks": { "db": "ok", "redis": "ok", "bullmq": "ok" }, "version": "0.1.0" }
```

## Modelo de datos
- No hay nuevos modelos Prisma. Esta feature es puramente de instrumentación.
- Opcional: `model HealthCheckLog` para historial de health checks (solo si se quiere audit trail).

## Eventos y sincronización
- No hay WebSocket events nuevos.
- Las métricas de WebSocket (`petai_socketio_active_connections`) se actualizan en el gateway existente al conectar/desconectar.
- El BullMQ instrumentation se activa al añadir BullMQ (Feature #1/#2).

## Dependencias
- **Ninguna feature interna.** Es independiente.
- **Infra:** Docker Compose con Prometheus, Grafana, Alertmanager, Jaeger.
- **Paquetes:** ~15 paquetes OTel nuevos en `package.json`.

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Instalar OTel SDK + configurar main.ts + resource + export | 1 día |
| 2 | Instrumentar NestJS (auto) + PG + Redis + Socket.IO | 1 día |
| 3 | Métricas Prometheus custom + endpoint `/metrics` | 1 día |
| 4 | Logs correlacionados (traceId en winston) | 0.5 día |
| 5 | Docker Compose: Prometheus + Grafana + Alertmanager + Jaeger | 1 día |
| 6 | Dashboards Grafana (4) + alert rules | 1.5 días |
| 7 | Trace propagation BullMQ + WebSocket | 1 día |
| 8 | Tests (health enriquecido, metrics endpoint) + docs | 0.5 día |

**Total: ~7.5 días**

## Tests
- **Unit:** HealthCheckService (DB OK, DB down, Redis OK, Redis down)
- **Integration:** GET /metrics retorna formato válido, GET /health con sub-checks
- **E2E:** Enviar request → verificar que se genera trace en Jaeger
- **Edge:** Prometheus scrape durante alto tráfico, OTLP exporter timeout (no afectar request)

## Riesgos y notas
- **Overhead:** El overhead de OTel es ~2-5% de CPU. Aceptable para un backend game.
- **Sample rate:** En producción, usar sampling (10-20% de traces) para reducir cardinalidad.
- **Secrets:** Asegurar que los logs NO contienen API keys, tokens JWT, o datos de users PII.
- **Port 9464:** No expuesto públicamente; solo accesible desde la red interna de Docker/K8s.

## Preguntas abiertas
1. ¿Usar Cloud (GCP Cloud Trace / AWS X-Ray) o self-hosted Jaeger? (Propuesta: Jaeger en dev, Cloud en prod.)
2. ¿Retención de traces? (Propuesta: 7 días en dev, 30 en prod.)
3. ¿OTLP gRPC vs HTTP? (Propuesta: gRPC para rendimiento, fallback HTTP.)