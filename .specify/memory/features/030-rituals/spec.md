# Feature Specification: Rituals — Hábitos y Rituales

**Feature Branch**: `[030-rituals]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: El pet "aprende" los hábitos del jugador (alimentar a las 8AM, pelear los viernes, etc.). Mantener un ritual 7 días/semanas seguidos desbloquea un "gift ritual". Romper el ritmo NO castiga, pero el pet "se extraña".

## User Scenarios & Testing

### User Story 1 - Crear y ver rituales (Priority: P1)

Como jugador, quiero ver mis rituales activos en un panel (icono, progreso 5/7, hora, estado) y crear rituales explícitos.

**Why this priority**: Panel de rituales es la interfaz central.

**Independent Test**: Crear un ritual (`POST /v1/rituals/create`) y verificar que `GET /v1/rituals` y `GET /v1/rituals/active` lo muestran con progreso.

**Acceptance Scenarios**:
1. **Given** un ritual creado, **When** se consulta `GET /v1/rituals/active`, **Then** aparece con progreso 0/7.
2. **Given** 5 rituales activos, **When** se crea un 6º, **Then** el menos frecuente se desactiva.

---

### User Story 2 - Progresión y recompensa (Priority: P2)

Como jugador, quiero que al completar el ritual 7 días seguidos mi pet me dé una recompensa especial.

**Why this priority**: Es el incentivo central (constancia → recompensa).

**Independent Test**: Llamar `POST /v1/rituals/:id/check` 7 días; verificar que en el 7º se otorga el gift.

**Acceptance Scenarios**:
1. **Given** streak 6, **When** se completa el día 7, **Then** se otorga gift (coins+XP+item) y streak se reinicia.
2. **Given** completion posterior al 5º, **When** se recompensa, **Then** coins al 50%.

---

### User Story 3 - Ruptura sin castigo (Priority: P3)

Como jugador, quiero que al romper el ritmo no pierda nada, pero el pet note la ausencia; si rompo >3 días el ritual se pausa.

**Why this priority**: La filosofía "sin punitividad".

**Independent Test**: Simular ausencias; verificar que la racha se reinicia y que tras >3 días el ritual pasa a `paused`.

**Acceptance Scenarios**:
1. **Given** ausencia de 1 día, **When** se vuelve, **Then** streak=0, bonding no decae, estado sigue activo.
2. **Given** ausencia >3 días, **When** se detecta, **Then** ritual pasa a `paused`.

---

### Edge Cases

- Detección de patrón: ±30 min estricto; 3 apariciones consistentes → candidato.
- Adaptación: 3 cambios de horario → re-calibrar.
- Multi-pet: ritual por pet.
- Spacing de checks el mismo día → no cuenta dos veces.

## Requirements

### Functional Requirements

- **FR-001**: System MUST exponer `GET /v1/rituals` (todos los rituales + progreso).
- **FR-002**: System MUST exponer `POST /v1/rituals/create` (crear ritual activo).
- **FR-003**: System MUST exponer `GET /v1/rituals/active` (solo activos).
- **FR-004**: System MUST exponer `POST /v1/rituals/:id/check` (registrar completación).
- **FR-005**: System MUST detectar patrones (±30min, ≥3 apariciones) como candidatos vía `HabitDetectionService`.
- **FR-006**: System MUST otorgar gift al alcanzar streak 7 (config por tipo).
- **FR-007**: System MUST reiniciar racha en ruptura y pausar tras >3 días (sin castigo).
- **FR-008**: System MUST limitar a 5 rituales activos (desactiva el menos frecuente).
- **FR-009**: System MUST persistir `Ritual` y `RitualProgress` en Prisma.
- **FR-010**: System MUST emitir WS `ritual:progress` / `ritual:completed` / `ritual:missed`.

### Key Entities

- **Ritual** (nuevo): userId, petId, type, cadence, hour, minute, dayOfWeek, status
- **RitualProgress** (nuevo): ritualId, userId, petId, streak, totalCompletions, missCount, lastCompletedAt

## Success Criteria

### Measurable Outcomes

- **SC-001**: Detección identifica patrones consistentes en ≥3 apariciones.
- **SC-002**: Gift otorgado al 100% de rituales que completan 7 días.
- **SC-003**: Ruptura >3 días produce pausa sin pérdida de datos.
- **SC-004**: `check` responde en <300ms p95.

## Assumptions

- Reutiliza `User.coins`/`accountXp` para recompensas y `PetsService` para validación de pet.
- `RealtimeGateway` para los eventos WS.
- Gift items se registran como referencia (no se crea inventario en v1).
- Timezone del usuario se usa para calcular "día".
