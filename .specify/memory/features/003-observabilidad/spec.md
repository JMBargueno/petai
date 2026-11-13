# Feature Specification: Observabilidad con OpenTelemetry

**Feature Branch**: `003-observabilidad`

**Created**: 2026-03-25

**Status**: Draft

**Input**: User description: "Instrumentar el backend PetAI (NestJS + PostgreSQL + Redis + Socket.IO) con OpenTelemetry para obtener trazabilidad distribuida end-to-end (REST, WebSocket, jobs BullMQ), métricas de rendimiento en tiempo real (latencia p50/p95/p99, throughput, error rate) expuestas en Prometheus, logs correlacionados por traceId, dashboards en Grafana y alertas automáticas con anomaly detection para detectar degradaciones de latencia, errores y colas saturadas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver métricas de rendimiento en tiempo real en `/metrics` (Priority: P1)

Como DevOps, quiero exponer las métricas de rendimiento del backend (latencia p50/p95/p99 por endpoint, throughput, error rate, conexiones Socket.IO, profundidad de colas BullMQ, consumo de memoria/CPU) en un endpoint Prometheus `/metrics` para poder scrapeearlas y detectar degradaciones antes de que se conviertan en incidentes.

**Why this priority**: Es la base de toda la observabilidad. Sin métricas expuestas no hay dashboards ni alertas que puedan operar. Es el slice más valioso y más fácil de demostrar de forma aislada: basta con llamar al endpoint y leer el formato Prometheus.

**Independent Test**: Se prueba iniciando el backend y llamando a `GET /metrics` en el puerto 9464, verificando que la respuesta `200` contiene el formato texto de Prometheus con las series `petai_http_request_duration_seconds`, `petai_db_query_duration_seconds`, `petai_redis_operation_duration_seconds`, `petai_socketio_active_connections`, `petai_bullmq_queue_depth`, `petai_sse_stream_duration_seconds`, `petai_memory_heap_used_bytes` y `petai_gc_pause_seconds`.

**Acceptance Scenarios**:

1. **Given** el backend está corriendo con el SDK de OpenTelemetry inicializado en `main.ts`, **When** se llama a `GET /metrics` en el puerto 9464, **Then** se devuelve `200` con el formato Prometheus text exposition incluyendo el histograma `petai_http_request_duration_seconds` con labels `method`, `route` y `status`.
2. **Given** el histograma `petai_http_request_duration_seconds{method="GET",route="/pets"}` tras 200 peticiones, **When** se lee el endpoint, **Then** los buckets `le="0.05"`, `le="0.2"` y `le="+Inf"` suman 200 y permiten calcular p95/p99.
3. **Given** hay 42 conexiones Socket.IO activas y 3 jobs en la cola `missions:daily-reset`, **When** se lee `/metrics`, **Then** se devuelve `petai_socketio_active_connections 42` y `petai_bullmq_queue_depth{queue="missions:daily-reset"} 3`.

---

### User Story 2 - Trazar una request REST de punta a punta (Priority: P2)

Como desarrollador, quiero que cada request REST genere un trace de OpenTelemetry con spans anidadas (middleware auth → controller → service → query a DB → response) para poder abrir el backend de traces y ver exactamente dónde se está durmiendo o fallando una petición.

**Why this priority**: Es la capacidad de debugging principal ante un incidente. Independientemente de las métricas agregadas, el tracing por-request es lo que permite aislar el componente responsable de un error. Se prueba enviando una request y confirmando el trace en Jaeger.

**Independent Test**: Se envía una request REST (p. ej. `GET /pets`) con un Bearer token válido y se verifica que en el backend de traces (Jaeger) aparece un trace con un span padre (middleware) y spans hijas para el controller, el service y la query a PostgreSQL, todas bajo el mismo `traceId`.

**Acceptance Scenarios**:

1. **Given** una petición `GET /pets` con Bearer token válido, **When** se completa el ciclo middleware → controller → service → Prisma → response, **Then** se genera un único trace con un `traceId` y spans anidadas para cada capa, todas con `service.name="petai-backend"`.
2. **Given** una petición `POST /pets/:id/feed` que lanza un error de negocio, **When** se procesa la request, **Then** el span del service queda marcado con status error y el `traceId` se conserva a lo largo de los spans.
3. **Given** dos peticiones concurrentes distintas, **When** se consulta el backend de traces, **Then** cada una genera un `traceId` diferente y no se mezclan spans entre peticiones.

---

### User Story 3 - Correlar un evento WebSocket que dispara un job BullMQ (Priority: P3)

Como desarrollador, quiero ver el tracing distribuido de un evento WebSocket que encola un job BullMQ, de modo que el worker herede el `traceId` original y pueda reconstruir el flujo completo REST → WebSocket → job.

**Why this priority**: PetAI es intensivo en tiempo real y jobs asíncronos; sin propagación de contexto el tracing se "rompe" en el salto a WebSocket y a la cola, que es justo donde ocurren los incidentes más difíciles. Se prueba disparando un evento que encolue un job y verificando la continuidad del `traceId`.

**Independent Test**: Se emite un evento WebSocket que encola un job BullMQ y se verifica que el span del handler `@WebSocketGateway()` lleva el `traceId` del handshake (`x-trace-id`) y que el worker procesa el job bajo el mismo `traceId` (misma cadena de trace).

**Acceptance Scenarios**:

1. **Given** una conexión Socket.IO establecida pasando `x-trace-id` en el handshake, **When** el gateway recibe un evento que encola un job, **Then** el span del evento se correlaciona con la request origen y el job encolado porta el mismo `traceId` (contexto de `traceContextActiveSpan()`).
2. **Given** un job BullMQ pendiente con `traceId` propagado en el payload, **When** el worker lo procesa, **Then** el processing del job genera spans hijos bajo el `traceId` original y se puede ver la cadena completa.
3. **Given** un evento WebSocket recibido sin `x-trace-id` en el handshake, **When** el gateway lo procesa, **Then** se crea un nuevo trace (nuevo `traceId`) en lugar de fallar, y el job asociado hereda ese nuevo contexto.

### User Story 4 - Buscar un traceId en los logs y ver la request completa (Priority: P4)

Como desarrollador, quiero que cada línea de log (winston/pino) incluya `traceId` y `spanId`, para que al copiar el `traceId` de un trace pueda filtrar los logs y ver toda la request end-to-end correlacionada con el backend de traces.

**Why this priority**: El tracing muestra el mapa de latencia, pero los logs contienen el detalle (parámetros, errores, stack traces). Correlacionarlos por `traceId` es lo que convierte un debugging lento en directo. Se prueba enviando una request y buscando su `traceId` en los logs.

**Independent Test**: Se envía una request y se busca su `traceId` en la salida de logs, verificando que todas las líneas generadas por esa request (auth, controller, service, DB) incluyen el mismo `traceId` y un `spanId`, y que el formato es `{ timestamp, level, message, traceId, spanId, requestId, ... }`.

**Acceptance Scenarios**:

1. **Given** una request `GET /pets` con `traceId=T1` y `requestId=R1`, **When** se procesan los handlers del auth, el controller y el service, **Then** cada línea de log emitida incluye `traceId: T1` y el `requestId` `R1` queda enlazado a ese `traceId`.
2. **Given** un error de DB durante la request, **When** se loguea el stack trace, **Then** la línea de error lleva `traceId` y `spanId` del contexto activo y permite saltar al trace correspondiente.
3. **Given** una línea de log que contiene un token JWT, **When** se emite, **Then** se incluyen `traceId`/`spanId` pero el token NO aparece en el log (se redacta).

---

### User Story 5 - Ver los dashboards de observabilidad en Grafana (Priority: P5)

Como DevOps, quiero tener configurados en Grafana cuatro dashboards (Overview, Per-endpoint, WebSocket, BullMQ) con latencia, throughput, errores y consumo de CPU/RAM para tener una visión rápida y consolidada del estado del backend.

**Why this priority**: Centraliza en pantallas los datos que ya produce el backend; es el primer punto de entrada para monitorizar en producción y responde directamente al objetivo de "detectar degradaciones". Se prueba abriendo cada dashboard y verificando que pinta datos.

**Independent Test**: Se abre Grafana con Prometheus como datasource y se verifica que los dashboards Overview, Per-endpoint, WebSocket y BullMQ muestran datos reales (p95/p99 por ruta, throughput, error rate, CPU/RAM, conexiones, profundidad de cola) tras unos ciclos de scrape de 15 s.

**Acceptance Scenarios**:

1. **Given** Grafana conectado a un Prometheus que scrapea `:9464/metrics` cada 15 s, **When** se abre el dashboard Overview, **Then** se muestran latencia, throughput, error rate y CPU/RAM con datos del backend.
2. **Given** tráfico real sobre `/pets` y `/battles/matchmake`, **When** se abre el dashboard Per-endpoint, **Then** se muestran p50/p95/p99 por ruta y método.
3. **Given** conexiones Socket.IO y jobs BullMQ activos, **When** se abren los dashboards WebSocket y BullMQ, **Then** se muestran conexiones activas, eventos/s, latencia SSE y profundidad/tiempo de espera de colas respectivamente.

---

### User Story 6 - Recibir alertas automáticas ante anomalías (Priority: P6)

Como DevOps, quiero recibir una alerta (Slack/email) cuando el error rate supere el 1%, la latencia p95 se mantenga sobre 200 ms, la cola BullMQ supere 1000, ocurra un OOM kill o una GC pause supere 500 ms, para actuar antes de que lo note el usuario.

**Why this priority**: Convierte la observabilidad de reactiva a proactiva; es el valor final que reduce el tiempo de detección de incidentes. Depende de las métricas (P1) pero es un slice independiente y demostrable simulando la anomalía.

**Independent Test**: Se simula cada condición (p. ej. inyectar tráfico para que p95 > 200 ms sostenido 5 min) y se verifica que Prometheus/Alertmanager dispara la regla y entrega la notificación al canal configurado.

**Acceptance Scenarios**:

1. **Given** la latencia p95 sostenida > 200 ms durante 5 minutos, **When** se evalúan las reglas de Alertmanager, **Then** se dispara la alerta de latencia y se notifica por Slack/email.
2. **Given** un error rate > 1% durante 3 minutos, **When** se evalúa la regla de error rate, **Then** se dispara la alerta de errores.
3. **Given** la profundidad de una cola BullMQ > 1000, **When** se evalúa la regla de colas, **Then** se dispara la alerta de cola saturada.
4. **Given** un proceso con GC pause > 500 ms o un OOM kill, **When** se evalúan las reglas de runtime, **Then** se disparan las alertas de GC y de OOM respectivamente.

---

### Edge Cases

- **Fallo del exportador OTLP (timeout o backend de traces caído):** el sistema NO bloquea ni retrasa la request; los spans/métricas fallan en exportar de forma aislada y la petición responde con normalidad (batch processor con timeout acotado y sin reintentos que degraden la ruta crítica).
- **Prometheus no disponible o scrape fallido:** el endpoint `/metrics` sigue sirviendo las métricas y el backend no se cae; las métricas se pierden por ese ciclo pero se regeneran en el siguiente scrape.
- **Alta cardinalidad y alto tráfico:** en producción se aplica sampling de traces (10-20%) y un límite de buckets en los histogramas para no agotar la memoria ni el backend de traces.
- **Seguridad de `/metrics` (port 9464):** el endpoint NO se expone públicamente; solo es accesible desde la red interna de Docker/K8s y no debe ser alcanzable desde fuera sin credenciales.
- **Secretos/PII en los datos observados:** las API keys, tokens JWT y datos de usuario PII NO deben aparecer en logs, spans ni métricas (redacción obligatoria).
- **BullMQ sin inicializar (antes de Feature #1/#2):** las métricas de cola y la propagación de trace a jobs no generan datos hasta que se añade BullMQ; el sistema NO debe fallar por reportar series vacías.
- **Job que falla o reintenta:** el `traceId` se mantiene a través de los reintentos y un job fallido sigue quedando registrado como error en el trace.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST instrumentar todas las requests REST con spans de OpenTelemetry que cubran middleware de auth → controller → service → query a DB → response.
- **FR-002**: El sistema MUST exponer las métricas en `GET /metrics` (puerto 9464) en formato Prometheus text exposition.
- **FR-003**: El sistema MUST registrar estas métricas: latencia HTTP (histograma con labels `method`/`route`/`status`), duración de queries a DB, duración de operaciones Redis, conexiones Socket.IO activas, profundidad de colas BullMQ, duración de streams SSE, memoria heap en uso y GC pauses.
- **FR-004**: El sistema MUST crear un span por cada evento WebSocket y correlacionarlo con la request que lo originó mediante el `traceId` transmitido en el handshake de Socket.IO (`x-trace-id`).
- **FR-005**: El sistema MUST propagar el contexto de trace a los jobs BullMQ para que cada job procesado herede el `traceId` original.
- **FR-006**: El sistema MUST incluir `traceId` y `spanId` en cada línea de log (winston/pino) para permitir la correlación en Grafana.
- **FR-007**: El sistema MUST enriquecer el endpoint `GET /health` con sub-checks (`db`, `redis`, `bullmq`) devolviendo el estado por componente además de `uptime` y `version`.
- **FR-008**: El sistema MUST configurar los dashboards en Grafana: (a) Overview, (b) Per-endpoint, (c) WebSocket y (d) BullMQ.
- **FR-009**: El sistema MUST configurar reglas de alerta en Prometheus/Alertmanager para: p95 > 200 ms sostenido 5 min, error rate > 1% en 3 min, profundidad BullMQ > 1000, OOM kill y GC pause > 500 ms, con notificación a Slack/email.
- **FR-010**: El sistema MUST NOT permitir que los fallos de observabilidad (timeout del exportador OTLP, Prometheus caído) degraden la latencia o provoquen fallos en el procesamiento de requests; los fallos deben quedar aislados de la ruta crítica.
- **FR-011**: El sistema MUST NOT registrar datos sensibles (API keys, tokens JWT, datos PII de usuarios) en logs, spans ni métricas.
- **FR-012**: El sistema MUST restringir el acceso a `/metrics` (puerto 9464) a la red interna; el endpoint MUST NOT estar expuesto públicamente.
- **FR-013**: El sistema MUST aplicar sampling de traces en producción (10-20%) para controlar la cardinalidad.
- **FR-014**: El sistema MUST usar como atributos de recurso `service.name="petai-backend"` y `service.version` en todos los spans, métricas y logs.
- **FR-015**: El sistema MUST enviar los datos OTLP vía [NEEDS CLARIFICATION: gRPC frente a HTTP — propuesta gRPC con fallback a HTTP].

### Key Entities *(include if feature involves data)*

- **Trace / Span**: Representa una petición y sus operaciones anidadas. Atributos: `traceId`, `spanId`, `parentSpanId`, `service.name`, `service.version`. Relaciones: un trace agrupa los spans de una request (middleware → controller → service → DB) y los spans de WebSocket/BullMQ se enlazan al trace de origen.
- **Métrica Prometheus (serie)**: Representa una serie de valores medidos. Atributos: nombre (p. ej. `petai_http_request_duration_seconds`), labels (`method`, `route`, `status`, `queue_name`, `command`) y tipo (histograma/gauge). Relaciones: consumida por Prometheus y visualizada en Grafana.
- **LogRecord (registro de log)**: Representa una línea de log correlacionada. Atributos: `timestamp`, `level`, `message`, `traceId`, `spanId`, `requestId`, `userId`. Relaciones: enlazada al trace vía `traceId`.
- **HealthCheckLog (opcional)**: Historial de health checks con sub-checks por componente. Atributos: estado de `db`/`redis`/`bullmq` (`ok`/`fail`), `uptime`, `version`, `timestamp`. Solo si se desea un audit trail.
- **Alerta / Dashboard (configuración)**: Reglas de Alertmanager y paneles de Grafana que definen umbrales y visualizaciones; NO son entidades de datos de la app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las requests REST genera un trace de OpenTelemetry con spans de middleware → controller → service → DB → response verificables en el backend de traces.
- **SC-002**: El endpoint `/metrics` (9464) expone las 8 métricas requeridas en formato Prometheus válido en menos de 5 ms bajo tráfico normal.
- **SC-003**: Al menos el 95% de los eventos WebSocket y jobs BullMQ procesados están correlacionados con su request/`traceId` de origen (continuidad de trace).
- **SC-004**: El 100% de las líneas de log incluyen `traceId` y `spanId`, permitiendo reconstruir una request end-to-end buscando por `traceId`.
- **SC-005**: Los 4 dashboards Grafana muestran datos en tiempo real (p95/p99 por endpoint, throughput, error rate, CPU/RAM) con actualización en menos de 15 s.
- **SC-006**: Las alertas se disparan de forma fiable ante las anomalías simuladas (p95 > 200 ms 5 min, error > 1% 3 min, BullMQ > 1000) con notificación en menos de 60 s.
- **SC-007**: El overhead de instrumentación NO supera el 5% de CPU del backend bajo carga normal, medido frente a un baseline sin OTel.
- **SC-008**: Ningún fallo de observabilidad (timeout del exportador, Prometheus caído) provoca peticiones fallidas ni degrada la latencia más del 5% en una prueba de 1000 requests.

## Assumptions

- Se reutiliza el stack existente (NestJS + PostgreSQL/Prisma + Redis/ioredis + Socket.IO + BullMQ) y el modelo `User` actual; no se añaden nuevos modelos Prisma, ya que esta feature es puramente de instrumentación.
- El SDK de OpenTelemetry se inicializa en `main.ts` con `NodeSDK`; ~15 paquetes OTel (`@opentelemetry/*`, `prom-client`, `@opentelemetry/sdk-logs`) se añaden a `package.json` (hoy no están presentes).
- El backend de traces es Jaeger en desarrollo y Grafana Tempo (o Cloud: GCP Cloud Trace / AWS X-Ray) en producción — propuesta pendiente de confirmación.
- OTLP se envía por gRPC con fallback a HTTP.
- Retención de traces: 7 días en desarrollo y 30 días en producción.
- En producción se aplica sampling de traces al 10-20% para controlar la cardinalidad.
- El puerto 9464 NO se expone públicamente; es accesible solo desde la red interna de Docker/K8s y sin autenticación.
- Prometheus scrapea `:9464/metrics` cada 15 s.
- El `requestId` ya presente en el formato de respuesta se enlaza al `traceId`.
- La instrumentación de BullMQ y WebSocket queda activa al añadir BullMQ (Feature #1/#2); hasta entonces esas series no generan datos.
- El backend NO emite secrets ni PII en los datos observados y se aplica redacción obligatoria.