# Feature Specification: Multi-Device Presence y Co-op Pet Care

**Feature Branch**: `[021-multi-device]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: Capa de presencia multi-device con heartbeat y sistema de "visitas" entre amigos donde un usuario autorizado puede interactuar con el pet de otro.

## User Scenarios & Testing

### User Story 1 - Presencia multi-device (Priority: P1)

Como jugador, quiero ver en qué dispositivos está conectado mi pet, para saber si está "vivo" en otro lado.

**Why this priority**: Awareness de dispositivos activos es la base de la experiencia multi-device.

**Independent Test**: Conectar 2 dispositivos (simular heartbeats), llamar a `GET /v1/presence/:userId`. Verificar que ambos aparecen como online.

**Acceptance Scenarios**:
1. **Given** 2 dispositivos activos (heartbeats <30s), **When** se consulta presencia, **Then** ambos aparecen con platform y lastSeen.
2. **Given** un device sin heartbeat hace 90s, **When** se consulta presencia, **Then** se marca como offline.

---

### User Story 2 - Co-op visits: Visitar el pet de un amigo (Priority: P2)

Como jugador, quiero visitar el pet de un amigo y alimentarlo, para tener interacción social.

**Why this priority**: Crea interacción social y comunidad.

**Independent Test**: Simular friendship accepted, llamar a `POST /v1/coop/visit` con action=feed. Verificar que el pet del amigo recibe la acción.

**Acceptance Scenarios**:
1. **Given** friendship accepted, **When** el visitante hace `POST /v1/coop/visit` action=feed, **Then** el pet del propietario se alimenta.
2. **Given** 5 visitas ya realizadas hoy, **When** se intenta una 6ta, **Then** se retorna 429 con mensaje "Límite de visitas alcanzado".
3. **Given** friendship no aceptada, **When** se intenta visit, **Then** se retorna 403.

---

### User Story 3 - Historia de visitas (Priority: P3)

Como jugador, quiero ver la historia de quién ha visitado mi pet, para sentir comunidad.

**Why this priority**: Transparencia social y badges.

**Independent Test**: Tras varias visitas, llamar a `GET /v1/coop/history`. Verificar lista de visitantes con acciones y timestamps.

**Acceptance Scenarios**:
1. **Given** 3 visitas recibidas, **When** se llama `GET /v1/coop/history`, **Then** se retorna lista con visitorId, action, createdAt.

---

### Edge Cases

- Propietario sin ningún device activo → visita se procesa, se notifica al reconectar.
- Friendship revocada mid-visit → acción se rechaza.
- Max 5 visitas/día por visitante a un mismo pet.
- 10 amigos máximo en lista de visitantes.
- Presencia expira tras 90s sin heartbeat.

## Requirements

### Functional Requirements

- **FR-001**: System MUST mantener presencia en Redis con heartbeat 30s y expiración 90s
- **FR-002**: System MUST exponer `GET /v1/presence/:userId` con dispositivos activos
- **FR-003**: System MUST exponer `POST /v1/coop/visit` para acciones de visita
- **FR-004**: System MUST exponer `GET /v1/coop/history` con historial de visitas
- **FR-005**: System MUST validar friendship (status=accepted) antes de procesar visita
- **FR-006**: System MUST rate-limitar 5 visitas/día por pet/visitor
- **FR-007**: System MUST persistir DevicePresence en Prisma
- **FR-008**: System MUST notificar al propietario cuando un amigo visita

### Key Entities

- **DevicePresence** (nuevo): deviceId, userId, platform, lastHeartbeat, status
- **CoopVisit** (nuevo): visitorId, ownerId, petId, action, xgained, createdAt
- **CoopFriendship** (nuevo): ownerId, visitorId, status (pending/accepted/revoked)

## Success Criteria

### Measurable Outcomes

- **SC-001**: Presencia visible en <500ms desde heartbeat
- **SC-002**: Sincronización de estado del pet en <500ms a todos los devices
- **SC-003**: Visit action procesada en <200ms
- **SC-004**: Expiración de presencia en 90s garantizada

## Assumptions

- Redis para presencia en tiempo real (O(1) hash reads)
- JWT en todos los endpoints
- Max 5 dispositivos por usuario (coincide con MAX_SOCKETS_PER_USER)
- Acciones de visita no alteran stats >10% (seguridad)
- V1: solo WS para notificaciones (sin FCM/APNs)
