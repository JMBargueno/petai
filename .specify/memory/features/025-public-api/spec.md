# Feature Specification: Public API + Webhooks para Terceros

**Feature Branch**: `025-public-api`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "API pública con API keys para acceso programático (leaderboards, pets opt-in, eventos), sistema de webhooks para notificar eventos de juego a terceros (pet.evolved, combat.finished, level.up), con HMAC signature y retry."

## User Scenarios & Testing

### User Story 1 - Crear una API Key (Priority: P1)

Como developer, quiero una API key con scopes para crear integraciones (bot, dashboard).

**Why this priority**: Sin API key no hay acceso a la API pública.

**Independent Test**: `POST /v1/apikeys` crea una key; el plaintext se devuelve una sola vez.

**Acceptance Scenarios**:
1. **Given** un usuario autenticado, **When** crea una key con scope `read:leaderboard`, **Then** recibe el key plaintext (una vez) y solo el hash se persiste.
2. **Given** un usuario con 5 keys, **When** intenta crear la 6ta, **Then** recibe 409.

---

### User Story 2 - Consumir la API Pública (Priority: P1)

Como developer, quiero consultar el leaderboard y los eventos globales con mi API key.

**Why this priority**: Es el valor de la API pública.

**Independent Test**: `GET /v1/public/leaderboard?element=&top=` con una key válida devuelve el top.

**Acceptance Scenarios**:
1. **Given** una key con scope `read:leaderboard`, **When** consulta el leaderboard, **Then** devuelve el top 100 por elemento.
2. **Given** una key sin ese scope, **When** consulta, **Then** recibe 403.
3. **Given** una key revocada, **When** consulta, **Then** recibe 401.

---

### User Story 3 - Registrar un Webhook (Priority: P2)

Como developer, quiero registrar una URL para recibir eventos de mi pet sin polling.

**Independent Test**: `POST /v1/webhooks` crea un webhook; `dispatch` firma el payload con HMAC-SHA256.

**Acceptance Scenarios**:
1. **Given** un usuario, **When** registra `https://mybot.com/hook` con events `[pet.evolved]`, **Then** se crea el webhook.
2. **Given** un usuario con 10 webhooks, **When** registra otro, **Then** recibe 409.
3. **Given** una URL a IP privada (SSRF), **When** lo registra, **Then** recibe 400.

### Edge Cases

- API key sin scope → 403.
- Key revocada → 401.
- Rate limit 100 req/min por API key → 429.
- Webhook a IP privada / no HTTPS → 400.
- 5 fallos de entrega consecutivos → webhook desactivado.

## Requirements

### Functional Requirements

- **FR-001**: `POST /v1/apikeys` DEBE crear una key con scopes; persistir solo el hash (SHA-256).
- **FR-002**: `GET /v1/public/leaderboard` (scope `read:leaderboard`) DEBE devolver el top 100 por elemento.
- **FR-003**: `GET /v1/public/events` (scope `read:events`) DEBE devolver eventos globales.
- **FR-004**: `POST /v1/webhooks` DEBE registrar una URL + events + secret (max 10/user, HTTPS, anti-SSRF).
- **FR-005**: El dispatch DEBE firmar el payload con HMAC-SHA256 y reintentar 3 veces (1s, 5s, 30s).
- **FR-006**: Rate limit 100 req/min por API key (Redis, con respaldo en DB).
- **FR-007**: 5 fallos consecutivos DEBE desactivar el webhook.

### Key Entities

- **ApiKey**: id, userId, name, keyHash (SHA-256 @unique), scopes Json, lastUsedAt?, revokedAt?, createdAt.
- **Webhook**: id, userId, url, secret, events Json, active, lastDeliveryAt?, failureCount, createdAt.
- **WebhookDelivery**: id, webhookId, event, status (delivered|failed|pending), statusCode?, attempts, error?, createdAt.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Public endpoints stateless O(1); aguantan 1M req/min.
- **SC-002**: Webhook delivery es asíncrono; el trigger no bloquea la request.
- **SC-003**: 100% de los payloads de webhook llevan firma HMAC verificable.
- **SC-004**: El rate limit por API key se aplica en <1ms (Redis O(1)).

## Assumptions

- La API pública corre detrás del mismo backend (sin CDN).
- El `Pet` tiene una opción de visibilidad pública (opt-in) en su configuración.
- Se usa HMAC-SHA256 con el `secret` del webhook para firmar los payloads.
