# Feature Specification: Torneo Knockout semanal

**Feature Branch**: `014-torneo`

**Created**: 2026-01-15

**Status**: Approved

**Input**: User description: "Torneo Knockout semanal — 64 jugadores Diamond+, best-of-2, cuota 50 gemas, premios por posición."

## User Scenarios & Testing

### User Story 1 - Inscribir al Torneo (Priority: P1)
El jugador Diamond+ paga 50 gemas para entrar al torneo.

**Acceptance Scenarios**:
1. **Given** un jugador con ELO ≥1700 y 50+ gemas, **When** POST /v1/tournament/enter, **Then** se descuenta 50 gemas y se crea la entrada.
2. **Given** un jugador con ELO <1700, **When** intenta inscribirse, **Then** recibe 400 "Se requiere liga Diamond".

### User Story 2 - Ver el Bracket (Priority: P1)
El jugador ve el bracket de 64 con seeding por ELO.

**Acceptance Scenarios**:
1. **Given** el torneo está en fase de bracket, **When** GET /v1/tournament/bracket, **Then** se muestra el bracket completo.

### User Story 3 - Ver Standings (Priority: P2)
El jugador ve su posición y progreso en el torneo.

**Acceptance Scenarios**:
1. **Given** el jugador está inscrito, **When** GET /v1/tournament/standings, **Then** ve su racha y posición.

### Edge Cases
- <64 jugadores (relleno con bots)
- Doble inscripción (400)
- Torneo finalizado (rechaza inscripción)

## Requirements

- **FR-001**: System MUST seleccionar top 64 por ELO de Diamond+ (≥1700).
- **FR-002**: System MUST cobrar 50 gemas de entrada transaccionalmente.
- **FR-003**: System MUST armar bracket con seeding determinista (1v64, 2v63, etc).
- **FR-004**: System MUST resolver duelos best-of-2 (2 seeds deterministas).
- **FR-005**: System MUST repartir premios: campeón 1000, finalistas 500, semis 250.
- **FR-006**: System MUST rellenar con bots si hay <64 inscritos.
- **FR-007**: System MUST ser público el bracket.

## Success Criteria

- **SC-001**: Bracket completo con 64 slots en <5s.
- **SC-002**: Cada duelo es reproducible (mismo seed → mismo resultado).
- **SC-003**: Premios suman exactamente 3000 gemas.

## Assumptions
- ELO ya existe en `Pet.elo`.
- El motor de combate se reutiliza.
- Bots se generan con `generateBot`.