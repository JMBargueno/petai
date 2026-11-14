# Feature Specification: Boss de Raid asíncrono

**Feature Branch**: `013-raid-boss`

**Created**: 2026-01-15

**Status**: Approved

**Input**: User description: "Boss de Raid asíncrono — cada día aparece un jefe elemental con 10M HP global, jugadores atacan asíncrono, daño se reparte proporcional."

## User Scenarios & Testing

### User Story 1 - Ver el Boss Activo y su HP Global (Priority: P1)

El jugador abre la pantalla de Raid y ve el jefe actual con su tema elemental, HP global restante, y su contribución personal al daño.

**Why this priority**: Sin visibilidad del objetivo no hay motivación; es el punto de entrada del bucle.

**Independent Test**: Se puede testear con GET /v1/raid/current que devuelve el boss activo con HP y stats.

**Acceptance Scenarios**:

1. **Given** un boss de temporada activo, **When** el jugador hace GET /v1/raid/current, **Then** ve el tema elemental, HP global restante, y su contribución acumulada.
2. **Given** el boss ha sido derrotado, **When** el jugador hace GET /v1/raid/current, **Then** ve el estado "defeated" y los tiempos de rotación.

---

### User Story 2 - Atacar al Boss con mi Pet (Priority: P1)

El jugador elige un pet y le ordena atacar al boss. El combate es determinista (seed) y el daño infligido se suma al HP global.

**Why this priority**: Es la acción central del raid; sin ella no hay progreso.

**Independent Test**: Se testea con POST /v1/raid/attack que ejecuta un combate, descuenta energía y actualiza HP global.

**Acceptance Scenarios**:

1. **Given** un boss activo y un pet con energía ≥15, **When** el jugador envía POST /v1/raid/attack, **Then** se ejecuta un combate de 30 rondas, se descuenta 15 de energía, y el daño se suma al HP global.
2. **Given** un pet con energía <15, **When** el jugador envía POST /v1/raid/attack, **Then** recibe 400 "La mascota está demasiado cansada".
3. **Given** el jugador ya hizo 10 ataques en las últimas 24h, **When** intenta atacar de nuevo, **Then** recibe 400 por límite de combates.

---

### User Story 3 - Ver el Ranking de Contribución (Priority: P2)

El jugador ve el top 100 de contribuciones con el daño de cada jugador y su porcentaje del total.

**Why this priority**: Genera motivación social y competencia amistosa.

**Independent Test**: GET /v1/raid/leaderboard devuelve el ranking correctamente.

**Acceptance Scenarios**:

1. **Given** 3 jugadores han atacado, **When** se consulta GET /v1/raid/leaderboard, **Then** se muestra el top ordenado por damageDealt.

---

### User Story 4 - Recibir Recompensas Proporcionales (Priority: P2)

Al caer el boss, cada participante recibe gemas proporcionales al daño infligido.

**Why this priority**: Es la recompensa que motiva el esfuerzo.

**Independent Test**: Se simula con el settle que verifica la distribución proporcional.

**Acceptance Scenarios**:

1. **Given** el boss cae con 3 participantes, **When** se ejecuta el settle, **Then** cada uno recibe gemas proporcionales a su daño.

---

### Edge Cases

- Un solo jugador mata al boss (recibe 100% del pool).
- Ataque con energía insuficiente (400).
- Dos ataques simultáneos (transacción protege el HP).
- El boss está caído (rechaza nuevos ataques).
- Cooldown entre ataques (400).

## Requirements

### Functional Requirements

- **FR-001**: System MUST crear un boss de raid activo por temporada con HP global de 10,000,000.
- **FR-002**: System MUST reutilizar el motor de combate determinista (`simulateBattle`) para cada ataque.
- **FR-003**: System MUST capar el daño máximo por ataque (maxDamagePerAttack del balance).
- **FR-004**: System MUST descontar 15 de energía por ataque y respetar el límite de 10 combates/24h.
- **FR-005**: System MUST sumar el daño al HP global de forma transaccional (evitar race conditions).
- **FR-006**: System MUST repartir recompensas proporcionales al daño al caer el boss.
- **FR-007**: System MUST rotar al boss (nueva instancia) al caer o al cambio de semana.
- **FR-008**: System MUST exponer el ranking de contribución (top 100).

### Key Entities

- **Raid**: Instancia semanal de raid con HP global, estado y tema elemental.
- **RaidBoss**: Config del boss (stats ×3, skills del tema, element).
- **RaidParticipant**: Contribución de un jugador (damageDealt, seed, timestamp).

## Success Criteria

### Measurable Outcomes

- **SC-001**: El boss cae en 24–48h con ~1000 DAU atacando 3 veces/día.
- **SC-002**: Cero pérdida de daño bajo concurrencia (transacciones correctas).
- **SC-003**: Cada ataque es reproducible (misma seed → mismo resultado).
- **SC-004**: El repartido de premios suma exactamente el pool total.

## Assumptions

- El motor de combate existente (`simulateBattle`) se reutiliza sin modificaciones.
- La energía del pet ya está gestionada por el módulo de pets.
- El balance de raid se configura en `balance.json → raids`.
- El boss usa stats ×3 del pet base del tema (determinado por temporada).