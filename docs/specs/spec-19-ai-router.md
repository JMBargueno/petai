# Spec: Multi-Model AI Router con Fallback Cascading

## ID
19 — Oleada 2 "Meta + IA" (NUEVAS_FUNCIONALIDADES §19)

## Resumen
Router de LLM multi-proveedor con selección por tipo de interacción, fallback cascading automático ante fallos (timeout/429/500), token budget per-request, y caching semántico en Redis con embeddings. Elimina vendor lock-in del `LlmProvider` actual y reduce costos hasta 60%.

## Contexto
El módulo `AiModule` actual usa un único `LlmProvider` (interfaz en `backend/src/modules/ai/llm-provider.ts`) con `OpenAICompatibleProvider`. El `ChatService` gestiona streaming, tool calls, moderación y persistencia. Un solo proveedor es un SPOF: si OpenAI cae o throttles, el chat IA muere. No hay diferenciación de costo por interacción ni caching para queries repetitivas.

Conecta con: `AiModule`, `ChatService`, `LlmProvider`, `AiConfig` (Prisma), `RedisService`, `UsageService`.

## Objetivos
- Eliminar SPOF de proveedores de LLM.
- Reducir costo IA hasta 60% vía routing por complejidad + caching semántico.
- Garantizar >99.9% disponibilidad de chat IA con fallback automático.
- Latencia p95 < 2000ms al primer token.

## User Stories
- Como jugador, quiero que el chat funcione aunque un proveedor caiga, para no perder interacción.
- Como operador, quiero dashboards por proveedor, para optimizar costos.
- Como jugador, quiero respuestas rápidas en chat casual, para no pagar de más.
- Como dev, quiero añadir un proveedor con un adapter <50 LOC, sin tocar `ChatService`.
- Como jugador, quiero no pagar tokens si mi query está cacheada.

## Criterios de aceptación
- [ ] AC1: Router selecciona proveedor según `interaction_type` (chat, tool_use, creative, naming).
- [ ] AC2: 429/500/timeout>10s → fallback al siguiente provider, stream re-inicia sin intervención del cliente.
- [ ] AC3: SSE re-conecta transparentemente; cliente no reenvía.
- [ ] AC4: Budget: exceder `max_tokens`/`max_cost_usd` → trunca y notifica.
- [ ] AC5: Caching semántico: similitud >0.92 → respuesta cacheada (TTL 24h).
- [ ] AC6: Redis para cache; fallback in-memory si Redis cae.
- [ ] AC7: `AiUsage.provider` registra cuál atendió.
- [ ] AC8: `LlmProvider` actual funciona como adapter (backwards compatible).
- [ ] AC9: Admin edita routing vía `POST /admin/ai/routing`.
- [ ] AC10: Soporta OpenAI, Anthropic, Gemini, Ollama, BYOK.

## Diseño técnico

### Arquitectura
```
ChatService (existente)
    ↓ streamChat(request, budget)
AiModelRouter (nuevo)
    ├── PolicyEngine → selecciona provider por interaction_type
    ├── SemanticCache → Redis vector search (embeddings)
    └── FallbackCascader → circuit breaker + retry
    ↓
    ┌─────────┬────────────┬──────────┬──────────┐
    OpenAI   Anthropic   Gemini    Ollama    BYOK
    (adapter) (adapter)  (adapter)  (adapter) (adapter)
```

### Backend
Nuevo módulo `backend/src/modules/ai/router/`:
- `router.service.ts` — orquestación principal
- `policy.service.ts` — selección por interaction_type
- `fallback.service.ts` — cascading + circuit breaker (Redis)
- `semantic-cache.service.ts` — embeddings + Redis vector search
- `budget.service.ts` — token/cost tracking per request
- `providers/` — adapters: `openai.adapter.ts`, `anthropic.adapter.ts`, `gemini.adapter.ts`, `ollama.adapter.ts`, `byok.adapter.ts`
- `router.controller.ts` — endpoints admin

Cambios en `ChatService`: injectar `AiModelRouter`, pasar `interactionType` + `budget`.
Cambios en `AiConfig`: `provider` acepta `"auto"`, nuevo `fallbackProviders Json`, `routingOverrides Json`.
Redis: `petai:ai:semantic-cache:*` (embeddings), `petai:ai:provider-status:*` (circuit breaker TTL 60s).
BullMQ: `semantic-cache-prune` (6h), `provider-health-check` (30s).
### Frontend
- Sin cambios en Tauri/Android (router transparente al cliente).
- Panel Admin: `/admin/ai/routing` — provider status, fallback weights, cache ratio, simulator.

### Infraestructura
- Redis Stack (RediSearch vector) para semantic cache. Alternativa: Qdrant si >5M embeddings.
- OpenTelemetry spans: `ai.router.call` (attributes: provider, latency_ms, tokens, cost_usd).

## Interfaz de API

**`POST /admin/ai/routing`** (RequireAdminGuard)
```json
// Request
{
  "interactionTypes": {
    "chat": { "primary": "openai", "model": "gpt-4o-mini", "fallbacks": ["gemini", "ollama"] },
    "tool_use": { "primary": "openai", "model": "gpt-4o", "fallbacks": ["anthropic"] },
    "creative": { "primary": "anthropic", "model": "claude-sonnet-4", "fallbacks": ["openai"] }
  },
  "budgets": { "chat": { "maxTokens": 2000, "maxCostUsd": 0.02 } },
  "semanticCache": { "enabled": true, "threshold": 0.92, "ttlSeconds": 86400 }
}
```

**`GET /admin/ai/routing`** → config + `providerStatus[]` + `cacheStats`.

**`GET /ai/status`** (user JWT) → `{ activeProvider, fallbackTriggered, cacheHit, estimatedCostUsd }`.

## Modelo de datos

**`AiConfig`** (modificado): `provider` = `"auto"|"openai"|...`, `fallbackProviders Json`, `routingOverrides Json`.

**`AiUsage`** (modificado): + `provider String?`, `costUsd Float`, `cacheHits Int`.

**`AiRouterConfig`** (nuevo):
```prisma
model AiRouterConfig {
  id              String   @id @default(uuid())
  interactionType String
  primary         String
  model           String
  fallbacks       Json
  maxTokens       Int
  maxCostUsd      Float
  enabled         Boolean  @default(true)
  updatedAt       DateTime @updatedAt
  @@unique([interactionType])
}
```

## Protocolos y comunicación
- Router emite `AsyncIterable<LlmEvent>` (mismo contrato `LlmProvider`).
- Fallback pre-stream: reinicio limpio. Mid-stream: v2 (emite error + re-inicia).
- Health: BullMQ ping 30s → circuit breaker 3 fallos → 60s open → half-open test.
- E429: espera `Retry-After` (max 5s) → fallback. E500/timeout: fallback inmediato.
- Si todos caen: `{ type: 'error', message: 'No provider disponible' }`.

## Security
- API keys: `KeyCryptoService` (AES-256-GCM, key tag por usuario).
- Admin: `RequireAdminGuard` middleware.
- Semantic cache: aislado por `userId`.
- Budget hard-limit: exceder → corta stream.
- Logging: hash SHA-256 de prompts (nunca texto completo).

## Dependencias
- `RedisService`/Redis Stack, `AiConfig` (Prisma), `KeyCryptoService`, `UsageService`.
- OpenTelemetry (Feature #3).
- `AiModule`/`ChatService` (existing, se modifica).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Extract `LlmProvider` + refactor adapters | 2 días |
| 2 | PolicyEngine + FallbackCascader + circuit breaker | 3 días |
| 3 | Adapters: Anthropic, Gemini, Ollama | 2 días |
| 4 | SemanticCacheService (Redis vector) | 3 días |
| 5 | BudgetService + integración UsageService | 1.5 días |
| 6 | Integración en ChatService | 1.5 días |
| 7 | Admin endpoints + panel | 2 días |
| 8 | BullMQ jobs + OTel spans | 1.5 días |
| 9 | Tests + docs | 2 días |

**Total: ~18.5 días (~4 semanas)**

## Performance y escalabilidad
- p95 < 2000ms al primer token.
- Cache hit target: 30-40% para queries recurrentes.
- Router stateless (solo Redis) → horizontally scalable.
- Cost target: -60% gasto en tokens.

## Tests
- Unit: PolicyEngine, FallbackCascader, SemanticCache, Budget.
- Integration: fallback chain con mock servers, cache hit/miss, budget exhaustion.
- E2E: chat con fallback, admin config → efecto.
- Load: 100 concurrent streams, p95 < 2s.
- Edge: todos down, Redis down, empty query, circular fallback.

## Riesgos y notas
- Tool-calls tienen syntax distinto por provider → normalización en adapter.
- Redis Stack → Qdrant si escala >5M embeddings.
- Fallback mid-stream: v1 no (evita incoherencia), v2 sí.
- Ollama local: solo BYOK mode.
- GDPR: prompts no se almacenan en cache, solo hash.

## Preguntas abiertas
1. Redis Stack vs Qdrant? → Redis hasta 1M, migrar a Qdrant.
2. Fallback mid-stream? → No v1, sí v2.
3. ¿Quién decide `interaction_type`? → `ChatService` según contexto.
4. ¿Providers chinos? → No v1 (adapter pattern lo permite).
5. ¿Cache por pet o por user? → Por user.