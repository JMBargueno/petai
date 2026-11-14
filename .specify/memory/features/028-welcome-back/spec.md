# Feature Specification: "Welcome Back" — Re-engagement Cinemático

**Feature Branch**: `028-welcome-back`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "Secuencia cinemática de 3 fases (diario visual → ritual de perdón → recovery buff) que se activa cuando el jugador abre la app tras >24h de ausencia. El pet 'vive' durante la ausencia y reacciona emocionalmente según la duración del abandono."

## User Scenarios & Testing

### User Story 1 - Detectar ausencia y mostrar el estado (Priority: P1)

Como jugador, quiero que al volver tras >24h mi pet muestre un momento emocional (no un "reset de stats").

**Why this priority**: Es la entrada al flujo. Sin detección de ausencia no hay cinemática.

**Independent Test**: `GET /v1/reengagement/status` con `now - lastLoginAt > 24h` devuelve el tramo y el plan de la secuencia.

**Acceptance Scenarios**:
1. **Given** un pet con `lastLoginAt` hace 2 días, **When** consulto status, **Then** recibo `tier=offended` con el ritual de 5 clicks.
2. **Given** un pet con `lastLoginAt` hace 10 minutos, **When** consulto status, **Then** recibo `active=false` (no se activa).
3. **Given** un pet con `lastLoginAt` hace 40 días, **When** consulto status, **Then** recibo `tier=emotional` con regalo.

---

### User Story 2 - Diario de ausencia (Priority: P2)

Como jugador, quiero ver un "diario" de lo que hizo mi pet mientras no estaba.

**Independent Test**: `GET /v1/reengagement/diary` devuelve 3-5 viñetas generadas con datos reales.

**Acceptance Scenarios**:
1. **Given** una ausencia de 24h, **When** consulto el diario, **Then** recibo ~3 entradas.
2. **Given** una ausencia de 7 días, **When** consulto, **Then** recibo hasta 5 entradas.

---

### User Story 3 - Ritual de perdón + recovery buff (Priority: P1)

Como jugador, quiero completar el ritual de perdón y recibir 24h sin decaimiento.

**Independent Test**: `POST /v1/reengagement/forgive` (con la acción requerida por el tramo) aplica `recoveryBuffUntil = now + 24h`.

**Acceptance Scenarios**:
1. **Given** tier `offended` (48h-7d), **When** envío 5 clicks, **Then** se aplica el buff y el pet pasa a `idle`.
2. **Given** tier `sad` (7-30d), **When** envío la secuencia de cuidado (feed+clean+minigame), **Then** se aplica el buff.
3. **Given** tier `emotional` (>30d), **When** completo, **Then** recibo un regalo (rarity ≥ rare) + 200 monedas.

### Edge Cases

- Ausencia < 24h → no se activa.
- Ausencia entre 24h-48h → tier `happy` (sin acción).
- 30d+ sin item disponible → solo 500 monedas.
- Anti-spam: 1 cinemática por ausencia; no repite si cierra/abre en 30min.

## Requirements

### Functional Requirements

- **FR-001**: La secuencia se activa SOLO si `24h < now - lastLoginAt < 30d`.
- **FR-002**: `GET /v1/reengagement/status` DEBE calcular el tramo (happy|offended|sad|emotional) y el plan.
- **FR-003**: `GET /v1/reengagement/diary` DEBE generar 3-5 viñetas con datos reales (sleep, food, battles, mood).
- **FR-004**: `POST /v1/reengagement/forgive` DEBE validar el ritual del tramo y aplicar `recoveryBuffUntil = now + 24h`.
- **FR-005**: Tier `emotional` DEBE otorgar un regalo (rarity ≥ rare) + 200 monedas.
- **FR-006**: Anti-spam: 1 secuencia por ausencia (`lastWelcomeBackAt`).
- **FR-007**: El pet NO muere ni se pierde; máximo "hibernación triste" tras 30 días.

### Key Entities

- **Pet** (extendido): `lastLoginAt`, `absenceDiary` (Json), `recoveryBuffUntil`, `welcomeBackTier`, `lastWelcomeBackAt`.
- **ReengagementStatus**: tramo, ausencia, plan (acciones requeridas), buff activo.
- **DiaryEntry**: `{ category, text, icon }`.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Retención D7 post-absencia >24h: +15% vs baseline.
- **SC-002**: Completion rate del ritual: >80%.
- **SC-003**: Skip rate: <10%.
- **SC-004**: Generación de diario < 100ms (operación pura en memoria).

## Assumptions

- `lastLoginAt` se actualiza en el flujo de login/interacción (se refresca al consultar status).
- Los datos del diario (battles ganadas, food, sleep) se derivan de `Battle`, `ChatMessage` y los vitals.
- El recovery buff congela el decaimiento del lazy tick durante 24h.
