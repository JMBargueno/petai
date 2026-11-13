# Feature Specification: Misiones y desafíos diarios/semanales

**Feature Branch**: `001-misiones-diarias`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Crear el sistema de misiones diarias (3-5) y semanales (5-7) de PetAI que ancla el login diario, conecta todos los sistemas del juego (cuidado, minijuegos, Arena, IA) en un bucle cohesivo y desbloquea un cofre diario al completar todas las misiones del día. Las misiones se generan dinámicamente para evitar repetición consecutiva."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el panel de misiones al abrir la app (Priority: P1)

Como jugador, al abrir PetAI quiero ver un panel con mis misiones activas del día (entre 3 y 5 diarias y entre 5 y 7 semanales) mostrando su objetivo, progreso actual y recompensa, para saber exactamente qué hacer hoy.

**Why this priority**: Es la "columna vertebral de retención" de toda la feature. Sin el panel no existe el bucle diario: el jugador no sabría qué acciones realizar. Es la base sobre la que se construyen el progreso, la recompensa y el cofre.

**Independent Test**: Se puede testear por completo llamando `GET /missions` con un Bearer token válido y verificando que la respuesta `200` incluye entre 3 y 5 misiones diarias activas y entre 5 y 7 semanales activas, cada una con `id`, `type`, `description`, `target`, `current` y `reward`.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado (Bearer token válido) con misiones generadas para el día actual, **When** llama a `GET /missions`, **Then** el sistema devuelve entre 3 y 5 misiones diarias activas y entre 5 y 7 misiones semanales activas, cada una con `type`, `target`, `current` y `reward`.
2. **Given** una petición a `GET /missions` sin token o con token inválido, **When** se procesa la petición, **Then** el sistema responde `401 Unauthorized`.
3. **Given** el usuario tiene 4 misiones diarias activas, **When** llama a `GET /missions`, **Then** la respuesta incluye `dailyChestUnlocked: false` y cada misión diaria expone un `resetsAt` correspondiente a la medianoche local del usuario.

---

### User Story 2 - Progreso en tiempo real (Priority: P2)

Como jugador, quiero que mi progreso en cada misión se incremente automáticamente y se refleje en tiempo real mientras realizo acciones (alimentar, pelear, chatear, jugar minijuegos, limpiar, dormir), sin tener que recargar la app.

**Why this priority**: Convierte el panel estático en un bucle vivo. Sin el tracking automático, las misiones no avanzarían al usar los sistemas existentes, rompiendo la premisa de "conectar todos los sistemas".

**Independent Test**: Se prueba disparando un evento de dominio (p. ej. `pet:fed` al llamar a `POST /pets/:id/feed`) y verificando que la misión activa de tipo `feed` del usuario incrementa `current` y el sistema emite el evento WebSocket `mission:progress`.

**Acceptance Scenarios**:

1. **Given** una misión diaria de tipo `feed` con `target: 2` y `current: 1`, **When** el usuario alimenta a su pet (`POST /pets/:id/feed` → evento `pet:fed`), **Then** `current` pasa a `2`, la misión se marca `completed: true` y se emite `mission:progress { missionId, current: 2, target: 2 }`.
2. **Given** una misión de tipo `battle` con `target: 1` y `current: 0`, **When** finaliza una batalla (`POST /battles/matchmake` → evento `battle:finished`), **Then** la misión `battle` pasa a `current: 1` y se marca `completed: true`.
3. **Given** el usuario NO tiene ninguna misión activa de tipo `chat`, **When** envía un mensaje (`POST /pets/:id/chat` → evento `chat:message_sent`), **Then** no se incrementa ningún progreso (no hay misión que actualizar) y la acción de chat se completa normalmente.

---

### User Story 3 - Recibir "¡Misión completada!" y reclamar la recompensa (Priority: P3)

Como jugador, quiero recibir una notificación de "¡Misión completada!" con la recompensa ganada y poder reclamarla (monedas, gemas, XP) de una sola vez.

**Why this priority**: Cierra el loop de recompensa que motiva a completar las misiones. Es el "instant of value" que justifica el esfuerzo del jugador.

**Independent Test**: Se prueba marcando una misión como completada y llamando a `POST /missions/:id/claim` para verificar que la recompensa se acredita de forma atómica, solo una vez, y que se emite `mission:completed`.

**Acceptance Scenarios**:

1. **Given** una misión `feed` completada y no reclamada, **When** el usuario llama a `POST /missions/:id/claim`, **Then** se acreditan `{ coins: 15, xp: 10 }` a su saldo, la misión pasa a `claimed: true` y se responde `200` con el reward.
2. **Given** una misión que ya fue reclamada, **When** el usuario vuelve a llamar a `POST /missions/:id/claim`, **Then** el sistema responde `409 Conflict` y no duplica la recompensa.
3. **Given** una misión no completada (`completed: false`), **When** el usuario llama a `POST /missions/:id/claim`, **Then** el sistema responde `400 Bad Request` y no acredita ninguna recompensa.
4. **Given** un `id` de misión que no existe o no pertenece al usuario, **When** llama a `POST /missions/:id/claim`, **Then** el sistema responde `404 Not Found`.
5. **Given** una misión cuyo progreso acaba de alcanzar el target por evento, **When** se completa, **Then** se emite vía WebSocket `mission:completed { missionId, type, reward, dailyCompleted, dailyTotal }`.

---

### User Story 4 - Desbloquear el cofre diario al completar todas las misiones (Priority: P4)

Como jugador, quiero que al completar todas las misiones diarias del día se desbloquee un cofre diario como recompensa "big win".

**Why this priority**: Es la recompensa máxima del bucle diario y el detonante de la retención ("un incentivo más por terminar todo"). Depende de las misiones diarias (P1) y del tracking (P2), por lo que va después.

**Independent Test**: Se prueba completando todas las misiones diarias del usuario y verificando que se desbloquea un `Chest` de tipo `daily`, que `GET /missions` retorna `dailyChestUnlocked: true` y que se emite `mission:daily_complete { chestUnlocked: true, chestId }`.

**Acceptance Scenarios**:

1. **Given** el usuario tiene 4 misiones diarias y 3 están completadas, **When** completa la 4ª, **Then** se desbloquea un `Chest` de tipo `daily`, `GET /missions` retorna `dailyChestUnlocked: true` y se emite `mission:daily_complete { chestUnlocked: true, chestId }`.
2. **Given** el usuario aún tiene misiones diarias incompletadas, **When** llama a `GET /missions`, **Then** `dailyChestUnlocked` es `false`.
3. **Given** el sistema de cofres (Feature #2) no está disponible, **When** se completa el último objetivo diario, **Then** el cofre diario se stubea con una recompensa fija (fallback) en lugar de fallar.

---

### User Story 5 - Misiones semanales con progreso a 7 días (Priority: P5)

Como jugador, quiero ver misiones semanales con progreso a lo largo de 7 días que me mantengan enganchado incluso si un día no puedo hacer las diarias.

**Why this priority**: Aporta retención a mediano plazo y variedad de objetivos (niveles, victorias, incubar raros). No bloquea el MVP diario, por lo que tiene menor prioridad.

**Independent Test**: Se verifica que `GET /missions` incluye 5-7 misiones con `period: "weekly"` y que al llegar el lunes 00:00 local el job `missions:weekly-reset` cierra las anteriores y genera las nuevas.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado, **When** llama a `GET /missions`, **Then** devuelve entre 5 y 7 misiones de `period: "weekly"` con `periodStart` (lunes 00:00 local) y `periodEnd` (domingo 23:59:59 local).
2. **Given** una misión semanal de tipo `battle_win` con `target: 3`, **When** el usuario gana 3 batallas a lo largo de la semana, **Then** la misión semanal acumula `current: 3` y se marca `completed: true`.
3. **Given** llega el lunes 00:00 en el timezone del usuario, **When** el job `missions:weekly-reset` se ejecuta, **Then** las misiones semanales anteriores se cierran y se generan nuevas para la semana en curso.

---

### User Story 6 - Misiones dinámicas con anti-repetición y reset por timezone (Priority: P6)

Como jugador, quiero que las misiones cambien cada día para no aburrirme y que el reset coincida con mi medianoche local, no con la de otro huso horario.

**Why this priority**: Es el "polish" de retención (novedad y respeto al huso horario). No afecta la viabilidad del bucle básico, por eso tiene la prioridad más baja.

**Independent Test**: Se dispara `missions:daily-reset` para un usuario y se verifica que se generan 3-5 misiones nuevas excluyendo combinaciones que ya aparecieron 3+ veces en el historial de los últimos 3 días.

**Acceptance Scenarios**:

1. **Given** llega la medianoche local del usuario, **When** el job `missions:daily-reset` corre, **Then** se generan 3-5 nuevas misiones diarias (nuevo `periodStart`/`periodEnd`) y las anteriores quedan cerradas.
2. **Given** el historial Redis `missions:history:{userId}` muestra la misma combinación de tipos los últimos 3 días, **When** se genera el conjunto de hoy, **Then** el algoritmo excluye esa combinación repetida (anti-repetición).
3. **Given** un usuario con `timezone: "America/Mexico_City"`, **When** llega su medianoche local, **Then** el reset ocurre a las 00:00 de ese timezone y no a las 00:00 UTC.

---

### Edge Cases

- **Múltiples pets (p. ej. 2 pets)**: Las misiones son por USUARIO, no por pet; las acciones sobre cualquier pet del usuario incrementan la misma misión activa.
- **Cambio horario (DST)**: La medianoche se calcula por timezone; en días de DST el reset puede dispararse a las 23:00 o 01:00 UTC. El scheduler debe usar cálculo timezone-aware, no un offset fijo.
- **Usuario offline todo el día y vuelve**: No hay catch-up de misiones de ayer (se descartan). El progreso en Redis se reconcilia de forma perezosa al hacer `GET /missions` si hay delta (lazy reconciliation).
- **Redis caído**: El listener usa `setImmediate` para no bloquear la acción principal y el progreso puede degradar a Postgres; el flush a PG ocurre cada 30s o al completar.
- **Evento sin misión activa de ese tipo**: Si un evento de dominio llega pero no hay misión activa del tipo correspondiente, es un no-op: no se incrementa nada y la acción subyacente sigue funcionando.
- **Race condition en `claim`**: Si dos peticiones de `POST /missions/:id/claim` llegan al mismo tiempo, solo la primera acredita la recompensa y la otra recibe `409 Conflict` (claim atómico sobre PG + Redis).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST return between 3 and 5 active daily missions and between 5 and 7 active weekly missions via `GET /missions` for the authenticated user.
- **FR-002**: System MUST return `401 Unauthorized` when `GET /missions`, `GET /missions/summary` or `POST /missions/:id/claim` is called without a valid Bearer token.
- **FR-003**: System MUST assign each mission a `type`, a numeric `target`, a `description`, and a reward (`rewardCoins`, `rewardGems`, `rewardXp`).
- **FR-004**: System MUST automatically increment the `current` progress of the matching active mission when the corresponding domain event fires (`pet:fed`→`feed`, `battle:finished`→`battle`, `minigame:finished`→`minigame`, `chat:message_sent`→`chat`, `pet:cleaned`→`clean`, `pet:slept`→`sleep`, `pet:evolved`→`evolve`, `egg:hatched`→`hatch`).
- **FR-005**: System MUST mark a mission `completed: true` when `current` reaches `target`, and MUST cap `current` at `target` (no overflow beyond the target).
- **FR-006**: System MUST emit the WebSocket event `mission:completed` `{ missionId, type, reward, dailyCompleted, dailyTotal }` when a mission is completed.
- **FR-007**: System MUST allow a completed mission's reward to be claimed exactly once via `POST /missions/:id/claim`, crediting the reward atomically to the user's balance.
- **FR-008**: System MUST return `409 Conflict` when claiming an already-claimed mission, `400 Bad Request` when the mission is not completed, and `404 Not Found` when the mission does not exist or does not belong to the requesting user.
- **FR-009**: System MUST unlock a `Chest` of type `daily` when all daily missions are completed, and MUST emit `mission:daily_complete` `{ chestUnlocked: true, chestId }`.
- **FR-010**: System MUST generate new daily missions at the user's local midnight and new weekly missions at local Monday 00:00, using the user's `timezone` field.
- **FR-011**: System MUST apply anti-repetition: the generation algorithm MUST NOT reuse a daily combination that appears 3 or more times in the last 3 days (stored in Redis `missions:history:{userId}`).
- **FR-012**: System MUST validate all mission progress server-side from domain events, and MUST NOT accept progress values from client input (anti-cheat).
- **FR-013**: System MUST emit `mission:progress` `{ missionId, current, target }` throttled to at most 1 message per 2 seconds.
- **FR-014**: System MUST persist mission state in PostgreSQL via the `Mission` model, and MUST flush the hot Redis progress counters to Postgres every 30 seconds or upon completion.
- **FR-015**: System MUST provide `GET /missions/summary` returning `{ dailyCompleted, dailyTotal, weeklyCompleted, weeklyTotal, streak, bestStreak }`.
- **FR-016**: System MUST track a `streak` (consecutive days of completing daily missions) and a `bestStreak` per user, and MUST tolerate a 1-day/1-week grace period in the streak.
- **FR-017**: System MUST scale the daily chest tier [NEEDS CLARIFICATION: ¿el cofre diario escala con el streak subiendo de tier cada 7 días? La propuesta del spec es SÍ, pero no están definidos los tiers ni su contenido].

### Key Entities *(include if feature involves data)*

- **Mission** (nuevo modelo Prisma): Representa una misión del usuario. Atributos: `id`, `userId`, `period` (`"daily" | "weekly"`), `type` (`feed | battle | minigame | chat | clean | sleep | evolve | hatch | level_up | battle_win | hatch_rare`), `description`, `target`, `current`, `completed`, `claimed`, `rewardCoins`, `rewardGems`, `rewardXp`, `periodStart`, `periodEnd`, `createdAt`. Relaciones: N:1 con `User` (`onDelete: Cascade`). Índices: `[userId, period, periodEnd]` y `[userId, completed]`.
- **User** (modificación existente): Se le añade la relación `missions Mission[]`. Ya posee `timezone` (clave para los resets por huso horario), `coins`, `gems` y `accountXp` (cuentas donde se acreditan las recompensas).
- **Chest** (Feature #2, dependiente): Cofre de tipo `daily` desbloqueable al completar todas las misiones diarias. Si Feature #2 no está lista, se stubea con recompensa fija.
- **missions.json** (`shared/game-data`): Configuración de misiones por `daily` y `weekly` (`minCount`/`maxCount`, tipos, `target`, `weight` y `reward`).
- **Redis keys (transitorias)**: `missions:progress:{userId}:{missionId}` (contador en caliente) y `missions:history:{userId}` (JSON array de los últimos 3 días de tipos, para anti-repetición).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95% de los usuarios ve sus misiones del día en < 2 segundos tras abrir la app (latencia de `GET /missions`).
- **SC-002**: El 90% de los usuarios autenticados con al menos una pet completa al menos 2 misiones diarias en su primer día.
- **SC-003**: El progreso de una misión se refleja en la UI en < 2 segundos tras la acción que lo genera (latencia de `mission:progress` / `mission:completed`).
- **SC-004**: La recompensa de una misión se acredita de forma atómica y sin duplicarse en el 100% de los reclamos concurrentes (0 duplicados en la prueba de race condition).
- **SC-005**: Las misiones diarias se regeneran correctamente para el 100% de los usuarios a su medianoche local, incluidas las zonas con cambio horario (DST), sin resets adelantados ni demorados.
- **SC-006**: La anti-repetición garantiza que ninguna combinación diaria se repita 3 días seguidos para el 100% de los usuarios.
- **SC-007**: El 90% de los usuarios que completan todas las misiones diarias abre el cofre diario el mismo día (completa el bucle reward).

## Assumptions

- Se reutiliza el sistema de autenticación existente (Bearer token) y el modelo `User` actual (con `timezone`, `coins`, `gems` y `accountXp`).
- El progreso de misión es por USUARIO, no por pet: las acciones sobre cualquier pet del usuario incrementan la misma misión activa.
- No hay catch-up de misiones del día anterior: se descartan (seguir la propuesta del spec).
- No se ofrece preview de las misiones del próximo día (se mantiene la sorpresa).
- El cofre diario depende de Feature #2 (Cofres); si no está disponible, se stubea con recompensa fija.
- BullMQ se añade al stack (no está en `package.json` actualmente) para los jobs `missions:daily-reset` y `missions:weekly-reset`.
- El módulo `missions` (NestJS) se crea en `backend/src/missions/` y se registra en `AppModule` (hoy no existe).
- El listener de eventos de dominio no bloquea la acción principal (se ejecuta vía `setImmediate`).
- El sistema de cuidado, Arena, Minijuegos y Chat IA emiten los eventos de dominio definidos (`pet:fed`, `battle:finished`, `minigame:finished`, `chat:message_sent`, `pet:cleaned`, `pet:slept`, `pet:evolved`, `egg:hatched`).
- Esta spec cubre el backend y el contrato de datos (API REST + WebSocket); la UI (`MissionPanel`) consume esos contratos sin cambios de comportamiento.
