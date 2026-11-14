# Feature Specification: Pet Buddies — Interacción entre Pets

**Feature Branch**: `[029-pet-buddies]`
**Created**: 2025-01-30
**Status**: Implemented
**Input**: Sistema de interacciones espontáneas entre 2+ mascotas del mismo usuario (o buddy de amigo en v2): perseguirse, dormir juntos, pelear juguetonamente, comer juntas y charlar. Otorgan bonding/happiness a ambas partes y crean la sensación de "vida social" propia.

## User Scenarios & Testing

### User Story 1 - Interacciones espontáneas entre 2 pets (Priority: P1)

Como jugador, quiero ver a mis 2 pets interactuar espontáneamente (persecución, mini-riña, charla, dormir juntos) para sentir que tienen vida propia.

**Why this priority**: Es el núcleo del feature — el "micro-mundo vivo" observable.

**Independent Test**: Con 2 pets activos, llamar `POST /v1/buddies/trigger` con un petId. Verificar que retorna una interacción válida (una de las 6) con efectos y que los stats del pet suben.

**Acceptance Scenarios**:
1. **Given** 2 pets del mismo user activos, **When** se dispara una interacción `play_fight`, **Then** ambos reciben +5 happiness y +1 bonding y se registra una `BuddyInteraction`.
2. **Given** interacción `idle_chat`, **When** se aplica, **Then** ambos reciben +1 bonding.
3. **Given** `sleep_together` con ambos energy < 40, **When** se aplica, **Then** se registra con efecto de recuperación extra.

---

### User Story 2 - Pausa / separación de buddies (Priority: P2)

Como jugador, quiero separar mis pets para que dejen de interactuar durante la sesión.

**Why this priority**: Control del usuario sobre el sistema social.

**Independent Test**: Crear un par y marcarlo separado, luego verificar que `trigger` no produce interacciones para ese par.

**Acceptance Scenarios**:
1. **Given** un par activo, **When** se marca `separated=true`, **Then** el trigger no genera interacción para ese par.
2. **Given** par separado, **When** se reactiva, **Then** vuelve a ser elegible.

---

### User Story 3 - Historial y caps (Priority: P3)

Como jugador/analytics, quiero registrar interacciones y respetar caps (máx 5/día de bonding por buddy, cooldown de 3 en 5 min).

**Why this priority**: Prevención de inflamación y soporte de métricas.

**Independent Test**: Disparar interacciones repetidas; verificar que el cooldown y el daily cap bloquean cuando se exceden.

**Acceptance Scenarios**:
1. **Given** 3 interacciones en <5 min, **When** se intenta una 4ª, **Then** se rechaza por cooldown.
2. **Given** 5 interacciones buddy hoy, **When** se intenta otra que otorgue bonding, **Then** el bonding no se aplica (cap).

---

### Edge Cases

- 3+ pets: solo 2 interactúan por turno (elegidos aleatoriamente).
- Pet `sleeping` o `sick`: no interacciona (demasiado débil/dormido).
- Sin 2 pets: trigger retorna `null` (no hay interacción).

## Requirements

### Functional Requirements

- **FR-001**: System MUST crear/obtener un `BuddyPair` para 2 pets del mismo usuario vía `POST /v1/buddies/pair`.
- **FR-002**: System MUST exponer `GET /v1/buddies/:petId` con estado del buddy del pet.
- **FR-003**: System MUST exponer `GET /v1/buddies/interactions` con historial.
- **FR-004**: System MUST exponer `POST /v1/buddies/trigger` que rola y aplica una interacción.
- **FR-005**: System MUST rolar interacciones con distribución ponderada (chase 12%, sleep 8%, play_fight 10%, eat 10%, idle_chat 15%, watch 10%).
- **FR-006**: System MUST otorgar +1 bonding a ambos (cap 5/día) y happiness según tipo.
- **FR-007**: System MUST aplicar cooldown (máx 3 en 5 min) y diario cap.
- **FR-008**: System MUST persistir `BuddyPair` y `BuddyInteraction` en Prisma.
- **FR-009**: System MUST emitir WS `buddy:interaction` al usuario.

### Key Entities

- **BuddyPair** (nuevo): userId, petAId, petBId, separated
- **BuddyInteraction** (nuevo): userId, petAId, petBId, type, duration, effects, createdAt

## Success Criteria

### Measurable Outcomes

- **SC-001**: Roll produce la distribución esperada (±5% en 1000 muestreos).
- **SC-002**: Cooldown y daily cap cumplen el 100% de bloqueos.
- **SC-003**: Stats de ambos pets se actualizan correctamente tras cada interacción.
- **SC-004**: `trigger` responde en <300ms p95.

## Assumptions

- Reutiliza `PetsService.applyActivityReward` para aplicar efectos y `BondingService.recordInteraction` para bonding.
- `RealtimeGateway.emitToUser` para el evento `buddy:interaction`.
- v2 (buddy de amigo) queda fuera de este scope; solo pares del mismo usuario.
