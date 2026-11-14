# Feature Specification: Combat Spectator en Tiempo Real + Highlights

**Feature Branch**: `[023-spectator]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: Modo espectación de combates en tiempo real con delay de 10s, sistema de highlights automáticos (críticos, remontadas, >30 rondas) con replay de 30s, y feed semanal.

## User Scenarios & Testing

### User Story 1 - Espectar combate en vivo (Priority: P1)

Como jugador, quiero ver el combate de un amigo en vivo con delay de 10s, para sentir el drama.

**Why this priority**: El spectate en vivo es la función central del feature.

**Independent Test**: Iniciar un combate, suscribirse como espectador (`POST /v1/spectator/subscribe`), verificar que se reciben rounds con delay.

**Acceptance Scenarios**:
1. **Given** combate en progreso round 5, **When** espectador se suscribe, **Then** ve el round 5 (el combatante ya está en 6, delay 10s).
2. **Given** combate privado (no público), **When** espectador intenta suscribirse, **Then** se rechaza con 403.
3. **Given** 100 espectadores en un combate, **When** un 101º intenta, **Then** se rechaza.

---

### User Story 2 - Highlights automáticos (Priority: P2)

Como jugador, quiero ver un replay de un combate épico, para compartirlo.

**Why this priority**: Genera contenido reutilizable y viralidad.

**Independent Test**: Finalizar un combate con crítico >50% damage. Verificar que se marca como highlight. Llamar a `GET /v1/spectator/highlights`. Verificar que aparece.

**Acceptance Scenarios**:
1. **Given** combate con crítico >50% damage, **When** finaliza, **Then** se marca como highlight automáticamente.
2. **Given** combate con remontada (<20% HP → gana), **When** finaliza, **Then** se marca como highlight.
3. **Given** combate >30 rounds, **When** finaliza, **Then** se marca como highlight.

---

### User Story 3 - Feed semanal (Priority: P3)

Como jugador, quiero un feed de "mejores combates de la semana", para tener contenido que ver.

**Why this priority**: Retención y engagement.

**Independent Test**: Con varios highlights, llamar a `GET /v1/spectator/highlights?period=weekly`. Verificar top 20 por rating.

**Acceptance Scenarios**:
1. **Given** 50 combates en la semana, **When** se consulta feed, **Then** se retorna top 20 por rating.
2. **Given** sin highlights en la semana, **When** se consulta, **Then** se retorna empty array.

---

### Edge Cases

- Combate <10s rounds → spectator ve todo con delay constante.
- LLM timeout → no se emite comentario (non-blocking).
- Combatante disconnecta mid-spectate → spectator sigue viendo buffer.
- 0 highlights en la semana → empty feed.
- Share URL expirada (24h) → 404.
- Replay expirado (7 días) → 404.

## Requirements

### Functional Requirements

- **FR-001**: System MUST aplicar delay de 10s al stream de combates
- **FR-002**: System MUST exponer `POST /v1/spectator/subscribe` para suscribir al combat
- **FR-003**: System MUST exponer `GET /v1/spectator/live` con estado del combat en vivo
- **FR-004**: System MUST exponer `GET /v1/spectator/highlights` con feed de highlights
- **FR-005**: System MUST detectar automáticamente highlights (crítico, remontada, >30 rounds)
- **FR-006**: System MUST calcular rating por combate
- **FR-007**: System MUST limitar a 100 espectadores por combate
- **FR-008**: System MUST respetar visibilidad (privado por defecto, público si ambos aceptan)
- **FR-009**: System MUST expirar replays a los 7 días
- **FR-010**: System MUST persistir SpectatorSession y Highlight en Prisma

### Key Entities

- **SpectatorSession** (nuevo): battleId, userId, joinedAt, lastRoundSeen, isActive
- **Highlight** (nuevo): battleId, type (critical/comeback/long), rating Float, replayData Json, expiresAt

## Success Criteria

### Measurable Outcomes

- **SC-001**: Delay exacto de 10s garantizado
- **SC-002**: Highlights detectados en 100% de combates con condiciones
- **SC-003**: Feed semanal con top 20 en <500ms
- **SC-004**: 100 concurrent spectators sin degradación

## Assumptions

- BattlesModule ya guarda el log JSON completo (replay es el log)
- Redis para buffer de rounds (delay 10s)
- LLM comments son opcionales (no bloquean el spectate)
- V1: solo español en comentarios
- Max 100 espectadores por combate (WS room limit)
