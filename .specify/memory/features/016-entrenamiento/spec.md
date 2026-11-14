# Feature Specification: Entrenamiento Elemental

**Feature Branch**: `016-entrenamiento-elemental`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "Dungeon de 5 pisos con enemigos elementales. El jugador elige la habilidad elemental correcta usando la tabla de afinidades. Éxito da buff ATK/ESP +5% por 24h. Bonus por adivinar el elemento del rival siguiente."

## User Scenarios & Testing

### User Story 1 - Iniciar Entrenamiento Elemental (Priority: P1)

Como jugador, quiero iniciar un dungeon de entrenamiento elemental para preparar a mi pet antes de pelear en el Arena.

**Why this priority**: Es la entrada al flujo completo. Sin iniciar la sesión, no hay experiencia de juego.

**Independent Test**: POST /v1/training/start devuelve una sesión válida con 5 pisos y enemigos elementales deterministas.

**Acceptance Scenarios**:
1. **Given** un usuario autenticado con un pet activo, **When** llama a POST /v1/training/start, **Then** se crea una TrainingSession con seed, 5 pisos, enemigos elementales y 3 hearts.
2. **Given** un usuario que ya tiene una sesión activa, **When** intenta iniciar otra, **Then** recibe un error 400 indicando sesión ya en curso.

---

### User Story 2 - Completar Pisos del Dungeon (Priority: P1)

Como jugador, quiero elegir la habilidad elemental correcta para cada piso y avanzar por el dungeon.

**Why this priority**: Es el núcleo del minijuego. La mecánica de afinidades elementales es el diferenciador.

**Independent Test**: POST /v1/training/submit con la respuesta correcta avanza el piso; incorrecta resta un heart.

**Acceptance Scenarios**:
1. **Given** una sesión en piso 1 con un enemigo de tipo planta, **When** el jugador elige habilidad de fuego (ventajosa ×1.5), **Then** avanza al piso 2.
2. **Given** una sesión en piso 3 con un enemigo de tipo agua, **When** el jugador elige habilidad de agua (desventajosa ×0.67), **Then** pierde un heart.
3. **Given** una sesión con 0 hearts, **When** el jugador falla otro piso, **Then** la sesión termina como "fallida" sin buff.

---

### User Story 3 - Recibir Buff de Entrenamiento (Priority: P2)

Como jugador, quiero recibir un buff de +5% ATK/ESP por 24h al completar los 5 pisos con al menos 1 heart.

**Why this priority**: Es la recompensa que conecta el minijuego con el Arena y motiva el entrenamiento.

**Independent Test**: GET /v1/training/active-buff devuelve el buff activo tras completar el dungeon.

**Acceptance Scenarios**:
1. **Given** un dungeon completado con 5/5 pisos, **When** la sesión finaliza, **Then** se aplica CombatBuff multiplicador +5% ATK/ESP por 24h.
2. **Given** un dungeon fallado (0 hearts), **When** la sesión finaliza, **Then** no se aplica buff.

---

### User Story 4 - Bonus de Predicción (Priority: P3)

Como jugador, quiero adivinar el elemento del rival del siguiente piso para ganar +2% extra al buff.

**Why this priority**: Estrategia adicional que enriquece la experiencia pero no es crítica.

**Independent Test**: Si el jugador predice correctamente el elemento del piso siguiente, el buff aumenta a +7%.

**Acceptance Scenarios**:
1. **Given** una sesión en piso 2, **When** el jugador predice correctamente el elemento del piso 3, **Then** el buff final es +7% en vez de +5%.

### Edge Cases

- Pet dormido → 400 (no puede entrenar).
- Energía insuficiente (< 10) → 400.
- Límite diario de 20 sesiones alcanzado → 400.
- Cooldown entre sesiones (30s) → 400.
- Pet con solo 1 habilidad elemental equipada → puede no tener ventajosa contra un piso (dificultad por diseño).
- Buff combinado con cocina: techo de +20% sobre la stat.

## Requirements

### Functional Requirements

- **FR-001**: Sistema DEBE permitir iniciar una sesión de entrenamiento elemental (5 pisos, 3 hearts).
- **FR-002**: Cada piso DEBE generar un enemigo elemental determinista usando la seed de la sesión.
- **FR-003**: El jugador DEBE poder elegir una habilidad elemental para cada piso.
- **FR-004**: El resultado de cada piso DEBE validarse contra la tabla de afinidades (×1.5 ventajosa, ×0.67 desventajosa).
- **FR-005**: Completar 5 pisos con ≥1 heart DEBE dar CombatBuff multiplicador +5% ATK/ESP por 24h.
- **FR-006**: El bonus de predicción DEBE dar +2% extra al buff si se adivina el elemento del piso siguiente.
- **FR-007**: El servidor DEBE revalidar cada piso con seed + floor (no confiar en el cliente).
- **FR-008**: Se deben respetar límites: energía 10, cooldown 30s, 20 sesiones/día.

### Key Entities

- **TrainingSession**: Sesión de entrenamiento (userId, petId, seed, floors, hearts, status, predictionCorrect)
- **TrainingFloor**: Piso individual (elemento enemigo, stats, resultado)
- **TrainingBuff**: Buff activo (petId, multiplier, type, expiresAt)

## Success Criteria

### Measurable Outcomes

- **SC-001**: 90% de los jugadores que inician un dungeon completan al menos 3 pisos.
- **SC-002**: El buff de +5% es medible en el Arena: el pet con buff gana 5-10% más de combates.
- **SC-003**: El dungeon es reproducible: misma seed → mismo dungeon (verificado por tests).
- **SC-004**: Tiempo medio por sesión < 3 minutos.

## Assumptions

- El motor de combate (`elementMultiplier`) está disponible y estable.
- El pet tiene al menos 1 habilidad elemental equipada.
- Los datos de balance (`elementAdvantage`, `elementDisadvantage`) provienen de `balance.json`.
- La sesión expira a las 10 minutos si no se completa.
