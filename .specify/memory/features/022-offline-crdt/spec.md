# Feature Specification: Offline-First con CRDT Sync

**Feature Branch**: `[022-offline-crdt]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: Sistema local-first con registro de acciones offline y sincronización delta al reconectar. Resolución de conflictos: LWW (stats), merge (inventario), deterministic (combate).

## User Scenarios & Testing

### User Story 1 - Push acciones offline (Priority: P1)

Como jugador, quiero alimentar a mi pet en el metro sin señal y que al reconectar se sincronice.

**Why this priority**: Sin sync no hay offline-first.

**Independent Test**: Llamar a `POST /v1/sync/push` con una lista de acciones offline. Verificar que se aplican al pet y se retorna newVersion.

**Acceptance Scenarios**:
1. **Given** 10 acciones offline (feed, play), **When** se envían a `/v1/sync/push`, **Then** se aplican al pet, se retorna `newVersion` y estado actualizado.
2. **Given** una acción inválida (item no existe), **When** se envía, **Then** se retorna `rejected` con reason para esa acción.
3. **Given** reenviar la misma acción (mismo id), **When** se procesa, **Then** no se duplica (idempotencia).

---

### User Story 2 - Pull estado sincronizado (Priority: P2)

Como jugador, quiero obtener el estado actualizado del server al reconectar.

**Why this priority**: El server es la fuente de verdad para decay.

**Independent Test**: Llamar a `GET /v1/sync/pull?sinceVersion=X`. Verificar que retorna deltas desde esa versión.

**Acceptance Scenarios**:
1. **Given** baseVersion=5, **When** se llama `/v1/sync/pull?sinceVersion=5`, **Then** se retornan los cambios de la versión 5 en adelante.
2. **Given** no hay cambios, **When** se llama pull, **Then** se retorna empty deltas y la misma version.

---

### User Story 3 - Status sync (Priority: P3)

Como jugador, quiero ver el estado de sincronización de mi dispositivo.

**Why this priority**: UI feedback "Offline — X acciones pendientes".

**Independent Test**: Llamar a `GET /v1/sync/status`. Verificar que retorna version actual, pending count, last sync.

**Acceptance Scenarios**:
1. **Given** 3 acciones pendientes en client, **When** se consulta status, **Then** se retorna pendingCount=3.

---

### Edge Cases

- Max 500 acciones en queue: exceder → descartar más antiguas.
- Pet "no puede morir" offline: health min 10.
- Conflict LWW: server gana para decay, client gana para user actions.
- Batch >100 acciones: chunk en grupos de 50.
- Timeout push 10s → reintentar (idempotente).
- Server rechaza acción → notificar al usuario con reason.

## Requirements

### Functional Requirements

- **FR-001**: System MUST exponer `POST /v1/sync/push` para enviar batch de acciones
- **FR-002**: System MUST exponer `GET /v1/sync/pull` para obtener delta state
- **FR-003**: System MUST exponer `GET /v1/sync/status` con estado de sync
- **FR-004**: System MUST aplicar LWW conflict resolution para stats
- **FR-005**: System MUST aplicar merge conflict resolution para inventario
- **FR-006**: System MUST aplicar deterministic (seed) para combate
- **FR-007**: System MUST ser idempotente por action.id
- **FR-008**: System MUST validar acciones y rechazar inválidas con reason
- **FR-009**: System MUST rate-limitar 50 actions/min durante sync
- **FR-010**: System MUST soportar batch de hasta 500 acciones (chunk 50)

### Key Entities

- **SyncVersion** (nuevo): userId, version, state Json, updatedAt
- **SyncAction** (nuevo): id (uuid), userId, petId, type, args, timestamp, status

## Success Criteria

### Measurable Outcomes

- **SC-001**: Sync delta completo en <5s para <100 acciones
- **SC-002**: Conflict resolution automática sin intervención del usuario
- **SC-003**: Push batch de 50 acciones en <200ms
- **SC-004**: Idempotencia garantizada: reenvío nunca duplica

## Assumptions

- Server es fuente de verdad para decay (LWW)
- V1 usa OT simplificado (LWW + merge), no Yjs/Automerge
- Client gestiona SQLite/Room localmente
- Chat IA no funciona offline
- Health min 10 para prevenir muerte offline
