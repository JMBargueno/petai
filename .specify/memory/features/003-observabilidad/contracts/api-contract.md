# API Contract: Observabilidad

**Feature**: `003-observabilidad` | **Date**: 2026-03-25

## 1. Nuevos Endpoints

### `GET /metrics` — Puerto 9464 (servidor dedicado)

**Acceso**: Solo red interna Docker (NO expuesto al host). Sin autenticación.

**Content-Type**: `text/plain; version=0.0.4; charset=utf-8`

**Métricas expuestas**:

| Métrica | Labels | Tipo |
|---------|--------|------|
| `petai_http_request_duration_seconds` | `method`, `route`, `status` | Histogram |
| `petai_db_query_duration_seconds` | — | Histogram |
| `petai_redis_operation_duration_seconds` | `command` | Histogram |
| `petai_socketio_active_connections` | — | Gauge |
| `petai_bullmq_queue_depth` | `queue` | Gauge |
| `petai_sse_stream_duration_seconds` | `stream_type` | Histogram |
| `petai_memory_heap_used_bytes` | — | Gauge |
| `petai_gc_pause_seconds` | — | Histogram |

**Ejemplo de respuesta 200**:
```
# HELP petai_http_request_duration_seconds Latencia de requests HTTP (segundos)
# TYPE petai_http_request_duration_seconds histogram
petai_http_request_duration_seconds_bucket{method="GET",route="/v1/pets",status="200",le="0.05"} 82
petai_http_request_duration_seconds_bucket{method="GET",route="/v1/pets",status="200",le="0.2"} 188
petai_http_request_duration_seconds_bucket{method="GET",route="/v1/pets",status="200",le="+Inf"} 200
petai_http_request_duration_seconds_sum{method="GET",route="/v1/pets",status="200"} 12.34
petai_http_request_duration_seconds_count{method="GET",route="/v1/pets",status="200"} 200

# HELP petai_socketio_active_connections Conexiones Socket.IO activas
# TYPE petai_socketio_active_connections gauge
petai_socketio_active_connections 42

# HELP petai_bullmq_queue_depth Profundidad de colas BullMQ
# TYPE petai_bullmq_queue_depth gauge
petai_bullmq_queue_depth{queue="missions:daily-reset"} 3
```

---

### `GET /v1/health/otel` — Puerto 3000 (endpoint extendido)

**Acceso**: Público (mismo nivel que `/v1/health`).

**Response 200** (todo operativo):
```json
{
  "status": "ok",
  "uptime": 86400,
  "version": "0.1.0",
  "otel": {
    "enabled": true,
    "exporter": "otlp-grpc",
    "exporter_endpoint": "jaeger:4317",
    "traces_exporting": true,
    "metrics_exporting": true,
    "logs_exporting": true,
    "sampling_rate": 1.0,
    "active_traces_in_buffer": 12,
    "last_export_timestamp": "2026-03-25T12:00:00.000Z"
  }
}
```

**Response 200 con degradación** (exporter caído):
```json
{
  "status": "degraded",
  "uptime": 86400,
  "version": "0.1.0",
  "otel": {
    "enabled": true,
    "exporter": "otlp-grpc",
    "exporter_endpoint": "jaeger:4317",
    "traces_exporting": false,
    "metrics_exporting": true,
    "logs_exporting": true,
    "sampling_rate": 1.0,
    "active_traces_in_buffer": 250,
    "last_export_timestamp": "2026-03-25T11:58:00.000Z",
    "last_export_error": "connect ECONNREFUSED jaeger:4317"
  }
}
```

**Sub-checks de `/v1/health` (FR-007)**:
```json
{
  "status": "ok",
  "checks": {
    "db": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "bullmq": { "status": "ok", "active_workers": 3 }
  },
  "uptime": 86400,
  "version": "0.1.0"
}
```

---

## 2. Docker Service Configurations

### 2.1 Prometheus

**File**: `infra/observability/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert-rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  - job_name: "petai-backend"
    scrape_interval: 15s
    metrics_path: "/metrics"
    static_configs:
      - targets: ["backend:9464"]
        labels:
          service: "petai-backend"
          environment: "production"
```

**docker-compose (dev)**:
```yaml
  prometheus:
    image: prom/prometheus:latest
    container_name: petai-prometheus
    restart: unless-stopped
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./infra/observability/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./infra/observability/prometheus/alert-rules.yml:/etc/prometheus/alert-rules.yml
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=7d"
    networks:
      - petai-net
```

**docker-compose.prod**:
```yaml
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./infra/observability/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./infra/observability/prometheus/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=30d"
    depends_on:
      backend: { condition: service_started }
```

### 2.2 Grafana

**docker-compose (dev)**:
```yaml
  grafana:
    image: grafana/grafana:latest
    container_name: petai-grafana
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin_dev
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - ./infra/observability/grafana/datasource.yaml:/etc/grafana/provisioning/datasources/datasource.yaml
      - ./infra/observability/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - petai-net
```

**docker-compose.prod**:
```yaml
  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3000"
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?define GRAFANA_ADMIN_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - ./infra/observability/grafana/datasource.yaml:/etc/grafana/provisioning/datasources/datasource.yaml:ro
      - ./infra/observability/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - grafana_data:/var/lib/grafana
    depends_on:
      prometheus: { condition: service_started }
```

**Datasource** (`infra/observability/grafana/datasource.yaml`):
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### 2.3 Jaeger (solo desarrollo)

```yaml
  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: petai-jaeger
    restart: unless-stopped
    ports:
      - "127.0.0.1:16686:16686"  # UI
      - "127.0.0.1:4317:4317"    # OTLP gRPC
      - "127.0.0.1:4318:4318"    # OTLP HTTP
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
      SPAN_STORAGE_TYPE: badger
    volumes:
      - jaeger_data:/badgerdata
    networks:
      - petai-net
```

### 2.4 Alertmanager

```yaml
  alertmanager:
    image: prom/alertmanager:latest
    container_name: petai-alertmanager
    restart: unless-stopped
    ports:
      - "127.0.0.1:9093:9093"
    volumes:
      - ./infra/observability/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
    networks:
      - petai-net
```

### 2.5 Backend (modificado)

**Dockerfile** — añadir:
```dockerfile
EXPOSE 3000
EXPOSE 9464
```

**docker-compose.prod** — backend (env adicionales):
```yaml
    environment:
      OTEL_SERVICE_NAME: "petai-backend"
      OTEL_SERVICE_VERSION: "0.1.0"
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://jaeger:4317"
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc"
      OTEL_TRACES_SAMPLER: "parentbased_traceidratio"
      OTEL_TRACES_SAMPLER_ARG: "0.15"
      OTEL_METRICS_EXPORTER: "prometheus"
      METRICS_PORT: "9464"
```

**Ports del backend en prod**:
```yaml
    ports:
      - "127.0.0.1:3000:3000"  # API pública
      # 9464 NO expuesto al host — solo red interna
```

---

## 3. Alert Rules (PromQL)

**File**: `infra/observability/prometheus/alert-rules.yml`

```yaml
groups:
  - name: petai-observability
    rules:
      # 1. Latencia p95 sostenida > 200ms
      - alert: HighLatencyP95
        expr: |
          histogram_quantile(0.95,
            sum(rate(petai_http_request_duration_seconds_bucket[5m])) by (le)
          ) > 0.2
        for: 5m
        labels:
          severity: warning
          service: petai-backend
        annotations:
          summary: "Latencia p95 sostenida > 200ms"
          description: "El p95 es {{ $value | humanizeDuration }} (umbral: 200ms) desde hace 5 min."

      # 2. Error rate > 1%
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(petai_http_request_duration_seconds_count{status=~"5.."}[3m])) by (route)
            /
            sum(rate(petai_http_request_duration_seconds_count[3m])) by (route)
          ) > 0.01
        for: 3m
        labels:
          severity: critical
          service: petai-backend
        annotations:
          summary: "Error rate > 1% en {{ $labels.route }}"
          description: "El ratio de 5xx es {{ $value | humanizePercentage }} (umbral: 1%) desde hace 3 min."

      # 3. Cola BullMQ saturada (>1000)
      - alert: BullMQQueueSaturated
        expr: |
          max(petai_bullmq_queue_depth) by (queue) > 1000
        for: 2m
        labels:
          severity: critical
          service: petai-backend
        annotations:
          summary: "Cola {{ $labels.queue }} saturada (>1000 jobs)"
          description: "Profundidad: {{ $value }} jobs (umbral: 1000)."

      # 4. OOM Kill
      - alert: ProcessOOMKilled
        expr: |
          increase(container_oom_events_total{container="backend"}[5m]) > 0
        for: 0m
        labels:
          severity: critical
          service: petai-backend
        annotations:
          summary: "OOM kill detectado en backend"
          description: "El contenedor backend fue OOM-killed. Verificar límites de memoria."

      # 5. GC pause p99 > 500ms
      - alert: LongGCPause
        expr: |
          histogram_quantile(0.99,
            sum(rate(petai_gc_pause_seconds_bucket[10m])) by (le)
          ) > 0.5
        for: 1m
        labels:
          severity: warning
          service: petai-backend
        annotations:
          summary: "GC pause p99 > 500ms"
          description: "GC pauses p99 superan {{ $value | humanizeDuration }} (umbral: 500ms)."
```

---

## 4. Alertmanager Routing

**File**: `infra/observability/alertmanager/alertmanager.yml`

```yaml
route:
  receiver: "default"
  group_by: ["alertname", "severity"]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: "default"
    slack_configs:
      - api_url_file: /etc/alertmanager/slack-webhook-url
        channel: "#petai-alerts"
        send_resolved: true
        title: "[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}"
        text: "{{ range .Alerts }}*{{ .Annotations.summary }}*\n{{ .Annotations.description }}\n{{ end }}"
    email_configs:
      - to: "ops@petai.example.com"
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: "critical"
    target_match:
      severity: "warning"
    equal: ["alertname", "service"]
```

---

## 5. Grafana Dashboards

| Dashboard | Panels principales |
|-----------|-------------------|
| **Overview** | p95 global, throughput req/s, error rate %, CPU/RAM, conexiones activas |
| **Per-endpoint** | p50/p95/p99 por `route`+`method`, throughput por ruta, error rate por ruta |
| **WebSocket** | Conexiones activas, eventos/s, latencia SSE, disconnects/s |
| **BullMQ** | Profundidad por cola, tiempo de espera, jobs/s, jobs failed |

Provisioned via `infra/observability/grafana/dashboards/*.json` + `dashboards.yaml`.

---

## 6. Propagación de Contexto

### WebSocket (Socket.IO handshake)
```
Client → Server:
  socket.io handshake con auth token
  Header: x-trace-id: <traceId>

Server:
  activeSpan = traceContextActiveSpan()
  // Gateway crea span hijo del traceId recibido
```

### BullMQ (job payload)
```typescript
// Encolar:
const payload = { data: { /* ... */ }, traceId: getActiveTraceId(), spanId: getActiveSpanId() };
await queue.add('process', payload);

// Procesar:
processor = async (job) => {
  const span = tracer.startSpan('bullmq.process', {
    attributes: { 'trace.ancestors': job.data.traceId },
  });
  // ...
};
```

### Log format (pino)
```json
{
  "level": 30,
  "time": 1711329600000,
  "msg": "GET /v1/pets 200",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "requestId": "req-001",
  "userId": "u-123"
}
```

> **Redacción obligatoria**: `token`, `apiKey`, `authorization`, `password` → `"[REDACTED]"`