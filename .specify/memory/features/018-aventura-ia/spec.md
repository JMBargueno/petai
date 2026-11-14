# Feature Specification: Aventura Narrativa IA

**Feature Branch**: `018-aventura-narrativa-ia`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "La IA genera una aventura diaria de 3-5 escenas con choices. El jugador elige opciones, el LLM genera la siguiente escena. Resultado validado determinísticamente por stats. Recompensas XP/monedas. El pet recuerda la aventura (PetMemory). Modo premium con gemas."

## User Scenarios & Testing

### User Story 1 - Iniciar Aventura Diaria (Priority: P1)

Como jugador, quiero que mi pet me cuente una aventura personalizada cada día.

**Why this priority**: Es el flujo principal. Sin iniciar, no hay contenido.

**Independent Test**: POST /v1/adventure/start crea una Adventure con la primera escena generada por IA.

**Acceptance Scenarios**:
1. **Given** un usuario con un pet activo y cuota IA disponible, **When** llama a POST /v1/adventure/start, **Then** se crea una Adventure con 3-5 escenas planificadas y la primera escena generada.
2. **Given** un usuario que ya completó una aventura hoy, **When** intenta iniciar otra, **Then** recibe 400 (límite diario alcanzado).
3. **Given** un usuario sin cuota IA, **When** inicia aventura, **Then** se ofrece versión premium (gemas) o plantilla fallback.

---

### User Story 2 - Hacer Decisiones (Priority: P1)

Como jugador, quiero elegir opciones para avanzar la historia de la aventura.

**Why this priority**: Es la interacción core. Sin choices, no es interactive fiction.

**Independent Test**: POST /v1/adventure/choose avanza a la siguiente escena.

**Acceptance Scenarios**:
1. **Given** una aventura en escena 2, **When** elige opción 0, **Then** se genera la escena 3 con la LLM.
2. **Given** una aventura en la última escena, **When** elige una opción, **Then** se calcula el resultado determinísticamente y se aplican recompensas.

---

### User Story 3 - Resultado Determinístico y Recompensas (Priority: P1)

Como jugador, quiero que el resultado dependa de mis stats (no solo suerte) y recibir XP/monedas.

**Why this priority**: Es la validación que hace la aventura "justa" y premia el progreso.

**Independent Test**: El resultado (win/lose/partial) se calcula con fórmula: 60% stats + 40% decisiones + jitter.

**Acceptance Scenarios**:
1. **Given** un pet Mítico con buenas decisiones, **When** termina la aventura, **Then** resultado "win" + 30 XP + 20 coins.
2. **Given** un pet Normal con malas decisiones, **When** termina la aventura, **Then** resultado "lose" + 5 XP + 3 coins.
3. **Given** un pet medio con decisiones mixtas, **When** termina, **Then** resultado "partial" + 15 XP + 10 coins.

---

### User Story 4 - Pet Recuerda la Aventura (Priority: P2)

Como jugador, quiero que mi pet recuerde la aventura y la mencione en conversaciones futuras.

**Why this priority**: Es el diferenciador de retención: el pet tiene "memoria".

**Independent Test**: Tras completar una aventura, existe una PetMemory de tipo "adventure" con un resumen.

**Acceptance Scenarios**:
1. **Given** una aventura completada, **When** se crea la PetMemory, **Then** el resumen incluye: tema, resultado, y una línea emocional.
2. **Given** una PetMemory de aventura existente, **When** el pet habla, **Then** puede mencionar "aquella aventura donde..."

---

### User Story 5 - Aventura Premium (Priority: P3)

Como jugador que paga, quiero una aventura premium (más escenas, reintentar 1 decisión).

**Why this priority**: Monetización opcional que enriquece la experiencia.

**Independent Test**: Aventura premium tiene 5 escenas (vs 3 free) y permite reintentar 1 decisión.

**Acceptance Scenarios**:
1. **Given** un usuario con 10 gemas, **When** inicia aventura premium, **Then** se descuentan 10 gemas y la aventura tiene 5 escenas.

### Edge Cases

- LLM devuelve formato inválido → reintentar hasta 3x, luego fallback a plantilla.
- LLM excede budget de tokens → detener y ofrecer premium.
- Aventura abandonada 24h → cleanup, sin recompensa.
- 2 aventuras el mismo día → 400 la 2ª.
- Pet sin IA configurada → usar modo managed o fallback.

## Requirements

### Functional Requirements

- **FR-001**: Sistema DEBE permitir 1 aventura gratis/día por usuario.
- **FR-002**: La IA DEBE generar 3-5 escenas (premium 5, free 3) con texto + 2-3 opciones.
- **FR-003**: El resultado DEBE validarse determinísticamente: score = 0.6*stats + 0.4*decisions + jitter(±0.1).
- **FR-004**: Recompensas: win=30XP+20coins, partial=15XP+10coins, lose=5XP+3coins.
- **FR-005**: Se DEBE crear PetMemory (kind="adventure") al finalizar.
- **FR-006**: Se DEBE consumir AiUsage tokens y respetar cuotas.
- **FR-007**: Fallback a plantillas si el LLM falla o no hay cuota.
- **FR-008**: El narrador DEBE usar el temperamento/personalidad del pet.
- **FR-009**: Premium (gemas): 5 escenas + retry 1 decisión.
- **FR-010**: La última escena DEBE validarse con el motor de combate si hay combate.

### Key Entities

- **Adventure**: Sesión de aventura (userId, petId, seed, status, sceneCount, outcome, rewards)
- **AdventureScene**: Escena individual (text, choices[], isFinal)
- **AdventureChoice**: Opción elegida (sceneId, optionIndex, label)

## Success Criteria

### Measurable Outcomes

- **SC-001**: 70% de los inicios de aventura se completan (no se abandonan).
- **SC-002**: Distribución de resultados: ~40% win, ~40% partial, ~20% lose (pet medio).
- **SC-003**: El LLM genera escenas válidas en <80% de los casos sin retry.
- **SC-004**: Coste medio por aventura < 1500 tokens.
- **SC-005**: 30% de los usuarios mencionan la aventura en chat (PetMemory funciona).

## Assumptions

- El módulo AI (`AiConfigService`) está disponible para resolver el provider.
- El `UsageService` existe para registrar consumo de tokens.
- El `MemoryService` puede crear `PetMemory` records.
- Pet tiene `speciesId`, `element`, `level`, `rarity`, `personality` (temperamento) disponibles.
