# Feature Specification: Multi-Model AI Router

**Feature Branch**: `[019-ai-router]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: Router de LLM multi-proveedor con fallback cascading automático ante fallos, token budget per-request, y selección por tipo de interacción.

## User Scenarios & Testing

### User Story 1 - Chat funciona con fallback automático (Priority: P1)

Como jugador, quiero que el chat funcione aunque un proveedor de LLM caiga, para no perder la interacción con mi pet.

**Why this priority**: Elimina el SPOF (Single Point of Failure) del proveedor actual y garantiza >99.9% disponibilidad.

**Independent Test**: Configurar un provider que falle (429/500/timeout), enviar mensaje y verificar que se responde con el fallback provider.

**Acceptance Scenarios**:
1. **Given** provider primario OpenAI está en error 429, **When** el usuario envía un mensaje, **Then** el router cae automáticamente a Anthropic y el stream se re-inicia sin intervención del cliente.
2. **Given** todos los providers están caídos, **When** el usuario envía un mensaje, **Then** se retorna `{ type: 'error', message: 'No provider disponible' }`.

---

### User Story 2 - Selección de modelo por tipo de interacción (Priority: P2)

Como operador, quiero que el sistema seleccione el modelo adecuado según el tipo de interacción (chat casual, tool_use, creative, naming), para optimizar costos.

**Why this priority**: Reduce hasta 60% el costo de tokens al enrutar a modelos más baratos para tareas simples.

**Independent Test**: Configurar routing para `chat` → modelo barato, `creative` → modelo premium. Enviar mensajes de cada tipo y verificar el modelo usado.

**Acceptance Scenarios**:
1. **Given** `interaction_type` es "chat", **When** el router selecciona provider, **Then** se usa el modelo configurado para chat (p. ej. gpt-4o-mini).
2. **Given** `interaction_type` es "creative", **When** el router selecciona provider, **Then** se usa un modelo de mayor capacidad.

---

### User Story 3 - Token budget y tracking (Priority: P3)

Como operador, quiero que el sistema respete un límite de tokens y costo por request, para evitar gastos excesivos.

**Why this priority**: Protección contra gasto descontrolado y transparencia de costos.

**Independent Test**: Configurar `maxTokens=500`. Enviar una query que produzca >500 tokens. Verificar truncamiento y notificación.

**Acceptance Scenarios**:
1. **Given** `maxCostUsd=0.02`, **When** la respuesta excede el presupuesto, **Then** se trunca y se notifica al usuario.
2. **Given** AiConfig con `provider="auto"`, **When** se consulta `GET /v1/ai/models/budget`, **Then** se retorna el consumo actual del mes.

---

### Edge Cases

- Todos los providers caen simultáneamente → error claro al usuario.
- Redis cae → fallback a in-memory cache, no se pierde funcionalidad.
- Timeout >10s en un provider → inmediato fallback sin esperar.
- 429 con Retry-After → se espera (máx 5s) antes de fallback.
- Query vacía → 400 Validation Error.

## Requirements

### Functional Requirements

- **FR-001**: System MUST seleccionar provider según `interaction_type` (chat, tool_use, creative, naming)
- **FR-002**: System MUST ejecutar fallback cascading automático ante 429/500/timeout>10s
- **FR-003**: System MUST re-iniciar stream SSE sin intervención del cliente ante fallback
- **FR-004**: System MUST truncar respuesta y notificar al exceder `maxTokens`/`maxCostUsd`
- **FR-005**: System MUST soportar providers: OpenAI, Anthropic, Gemini, Ollama, BYOK
- **FR-006**: System MUST registrar `provider` en `AiUsage` para tracking por proveedor
- **FR-007**: System MUST exponer endpoint `GET /v1/ai/models` con providers disponibles y estado
- **FR-008**: System MUST exponer endpoint `POST /v1/ai/models/config` para editar routing
- **FR-009**: System MUST exponer endpoint `GET /v1/ai/models/budget` con consumo actual
- **FR-010**: System MUST soportar el `LlmProvider` actual como adapter (backwards compatible)

### Key Entities

- **AiConfig** (existente, extendido): `provider` acepta "auto", nuevo `fallbackProviders Json`, `routingOverrides Json`
- **AiRouterConfig** (nuevo): routing per interaction_type con primary, fallbacks, maxTokens, maxCostUsd
- **AiUsage** (existente, extendido): + `provider String?`, `costUsd Float`, `cacheHits Int`

## Success Criteria

### Measurable Outcomes

- **SC-001**: Latencia p95 < 2000ms al primer token con fallback
- **SC-002**: >99.9% disponibilidad de chat IA con fallback automático
- **SC-003**: -60% gasto en tokens vía routing por complejidad
- **SC-004**: Nuevo provider implementable en <50 LOC sin tocar ChatService

## Assumptions

- Redis disponible para cache y circuit breaker state (fallback in-memory si cae)
- El `ChatService` existente se modifica mínimamente para inyectar el router
- OpenTelemetry (Feature #3) disponible para traces
- JWT authentication existente para endpoints admin
