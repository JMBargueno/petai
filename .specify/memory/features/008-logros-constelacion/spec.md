# Feature Specification: Logros y Constelación Visual

**Feature Branch**: `008-logros-constelacion`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Crear el sistema de logros de PetAI con progresión visual en constelación. 5 categorías (Cuidado, Batalla, IA, Colección, Social), ~50-75 logros totales. Cada logro es una estrella que se ilumina. Rewards: monedas/gemas/item. Visibilidad pública opt-in. Da hitos de logro a largo plazo y un 'status' visible; a diferencia de misiones (diarias) y bonding (gradual), los logros son discretos y únicos. La constelación visual es la pieza diferenciadora: el perfil muestra estrellas que se iluminan."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el panel de logros y su estado (Priority: P1)

Como jugador, al abrir la sección de logros quiero ver la lista completa de mis logros organizados por categoría (Cuidado, Batalla, IA, Colección, Social), cada uno con su nombre, descripción, objetivo, progreso actual y recompensa, para saber qué hitos ya alcancé, cuáles estoy cerca de completar y cuáles aún están bloqueados.

**Why this priority**: Es la "columna vertebral" de toda la feature. Sin el panel no existe la experiencia: el jugador no sabría qué logros existen ni en qué estado están. Es la base sobre la que se construyen el tracking, el desbloqueo, las recompensas y la constelación visual.

**Independent Test**: Se puede testear por completo llamando `GET /achievements` con un Bearer token válido y verificando que la respuesta `200` incluye todos los logros definidos en `achievements.json`, cada uno con `id`, `category`, `name`, `description`, `tier`, `target`, `current`, `reward` y un `status` de `locked | in_progress | unlocked` coherente con `current` y `target`.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado (Bearer token válido) con un logro de `target: 10` y `current: 3`, **When** llama a `GET /achievements`, **Then** el sistema devuelve el logro con `status: "in_progress"`, `current: 3`, `target: 10` y `unlockedAt: null`.
2. **Given** un usuario con un logro de `target: 1` y `current: 1` (ya alcanzado), **When** llama a `GET /achievements`, **Then** el logro se devuelve con `status: "unlocked"` y un `unlockedAt` (ISO 8601) definido.
3. **Given** una petición a `GET /achievements` sin token o con token inválido, **When** se procesa la petición, **Then** el sistema responde `401 Unauthorized`.

---

### User Story 2 - Progreso automático por eventos de dominio (Priority: P2)

Como jugador, quiero que mi progreso en cada logro se incremente automáticamente mientras realizo acciones del juego (alimentar, pelear, chatear, eclosionar, limpiar, dormir, evolucionar), sin tener que hacer nada extra, para que los logros reflejen lo que realmente hice.

**Why this priority**: Sin el tracking automático, los logros no avanzarían al usar los sistemas existentes, rompiendo la premisa de "hitos a largo plazo". Reutiliza el mismo mecanismo de eventos de dominio que las misiones (Feature #1), lo que lo hace de bajo riesgo y coherente con el resto del juego.

**Independent Test**: Se prueba disparando un evento de dominio (p. ej. `pet:fed` al llamar a `POST /pets/:id/feed`) y verificando que el logro activo de `event: "pet:fed"` del usuario incrementa `current`, y que al alcanzar `target` el logro pasa a `unlocked` (ver US3).

**Acceptance Scenarios**:

1. **Given** un logro de `event: "pet:fed"` con `target: 5` y `current: 2`, **When** el usuario alimenta a su pet (`POST /pets/:id/feed` → evento `pet:fed`), **Then** `current` pasa a `3` y el logro sigue `in_progress`.
2. **Given** un logro de `event: "pet:fed"` con `target: 5` y `current: 5` (ya desbloqueado), **When** el usuario alimenta de nuevo (`pet:fed`), **Then** `current` NO se incrementa más (el logro ya está completado; no hay over-count) y la acción de feed se completa normalmente.
3. **Given** el usuario NO tiene ningún logro activo con `event: "battle:finished"`, **When** finaliza una batalla (`battle:finished`), **Then** no se incrementa ningún logro (no hay logro que actualizar) y la acción de batalla se completa sin efecto.
4. **Given** varios logros de la misma categoría comparten el mismo `event` (p. ej. 3 logros de `pet:fed` con objetivos 5, 20, 50), **When** llega un evento `pet:fed`, **Then** TODOS los logros activos con ese `event` se incrementan en 1 de forma independiente.

---

### User Story 3 - Desbloqueo con recompensa y notificación en tiempo real (Priority: P2)

Como jugador, cuando alcanzo un logro quiero que se ilumine la estrella correspondiente, que reciba su recompensa (monedas/gemas, o un item exclusivo si es epic/legendary) y que vea una notificación/animación inmediata, para sentir el logro como un hito.

**Why this priority**: El desbloqueo con reward es el "momento de valor" del logro. Sin él, el progreso (US2) no tendría consecuencia visible ni motivación. La notificación en tiempo real (WS) cierra el bucle emocional.

**Independent Test**: Se prueba forzando que un logro active alcance su `target` vía evento de dominio y verificando que: (a) `unlockedAt` se setea, (b) la recompensa se acredita de forma atómica (sin duplicar bajo race condition), y (c) se emite el evento WebSocket `achievement:unlocked` con `{ id, name, category, tier, reward }`.

**Acceptance Scenarios**:

1. **Given** un logro de `target: 5` con `current: 4` y `reward: { coins: 100 }`, **When** el usuario alcanza `current: 5` vía evento, **Then** el logro pasa a `unlocked`, `unlockedAt` se setea, `coins +100` se acreditan en el `User` de forma atómica y se emite `achievement:unlocked { id, name, category, tier, reward: { coins: 100 } }`.
2. **Given** un logro `legendary` cuyo `reward` incluye un `itemId` de item exclusivo (p. ej. una skin), **When** el logro se desbloquea, **Then** además de las monedas/gemas, se crea un `InventoryItem` del item exclusivo para el usuario (idempotente: no se duplica si el desbloqueo se re-dispara).
3. **Given** dos eventos concurrentes que ambos llevarían el logro a alcanzar `target`, **When** se procesan en paralelo, **Then** la recompensa se acredita SOLO una vez (0 duplicados en la prueba de race condition; transacción atómica con `updateMany` + condición sobre `unlockedAt`).

---

### User Story 4 - Ver mi constelación por categoría (Priority: P3)

Como jugador, quiero ver la constelación de cada categoría como una figura de estrellas con líneas de conexión, donde cada estrella se ilumina (gray → yellow → bright) según su estado, para que mi progreso sea una pieza visual atractiva y no solo una lista.

**Why this priority**: Es la pieza diferenciadora y compartible de la feature ("status visible"). Depende de US1 (necesita el estado de cada logro) y del layout estático; se implementa tras el núcleo de datos estar listo.

**Independent Test**: Se prueba llamando `GET /achievements/constellation/battle` y verificando que la respuesta `200` devuelve `{ category, stars: [{ id, x, y, status, name }] }` con coordenadas `x`, `y` normalizadas en [0,1] (desde `constellations.json`) y `status` coherente con `GET /achievements`, además de las `connections` para dibujar las líneas SVG.

**Acceptance Scenarios**:

1. **Given** la constelación `battle` tiene 12 estrellas definidas en `constellations.json` y el usuario ha desbloqueado 4, **When** llama a `GET /achievements/constellation/battle`, **Then** la respuesta incluye las 12 estrellas con sus coordenadas `{ x, y }`, cada una con `status` (4 `unlocked`, el resto `locked`/`in_progress`) y el arreglo `connections` de pares de `id` para las líneas.
2. **Given** una petición a `GET /achievements/constellation/categoria_inválida`, **When** se procesa la petición, **Then** el sistema responde `400 Bad Request` (categoría desconocida).
3. **Given** una petición a `GET /achievements/constellation/battle` sin token, **When** se procesa, **Then** el sistema responde `401 Unauthorized`.

---

### User Story 5 - Mostrar mis logros en mi perfil público (opt-in) (Priority: P3)

Como jugador, quiero poder activar/desactivar la visibilidad pública de mis logros, y cuando esté activo quiero que otros jugadores puedan ver mi constelación y mis logros desbloqueados desde mi perfil, sin ver el progreso interno (los logros no desbloqueados).

**Why this priority**: El "status visible" y la dimensión social. Es opt-in (privacidad por defecto) y no bloquea el núcleo; se implementa tras US1-3.

**Independent Test**: Se prueba (a) `PATCH /me { achievementsPublic: true }` y verificando que persiste, y (b) `GET /users/:id/achievements?public=true` con `achievementsPublic: true` devolviendo solo los logros `unlocked`, mientras que con `achievementsPublic: false` NO expone el progreso privado.

**Acceptance Scenarios**:

1. **Given** un usuario con `achievementsPublic: false` y 5 logros desbloqueados, **When** otro usuario llama a `GET /users/:id/achievements?public=true`, **Then** la respuesta NO incluye sus logros (privacidad por defecto): `achievementsPublic: false` y `stars: []`.
2. **Given** un usuario con `achievementsPublic: true` y 5 logros desbloqueados de `battle`, **When** otro usuario llama a `GET /users/:id/achievements?public=true`, **Then** la respuesta incluye `achievementsPublic: true` y las 5 estrellas `unlocked` (con `id`, `name`, `category`, `tier`), pero SIN el `current`/progreso de los logros no desbloqueados.
3. **Given** un usuario autenticado, **When** llama a `PATCH /me { achievementsPublic: true }`, **Then** el campo `achievementsPublic` se persiste en `User` y la siguiente `GET /me` lo refleja como `true`.

---

### User Story 6 - Compartir mi constelación como imagen (Priority: P4)

Como jugador, quiero poder exportar mi constelación (o las de una categoría) como una imagen (PNG) con mi nombre y las estrellas iluminadas, para compartirla en redes sin exponer datos privados.

**Why this priority**: Función "nice-to-have" de viralidad/compartir, frontend-only (genera la imagen en el cliente a partir de los datos de US4). No afecta al backend ni bloquea nada; se hace al final.

**Independent Test**: Se prueba en el escritorio (desktop) generando el PNG desde la vista de constelación y verificando que el archivo contiene el nombre del jugador y las estrellas iluminadas correctas, y que no incluye datos de logros no desbloqueados.

**Acceptance Scenarios**:

1. **Given** un usuario con la constelación `battle` cargada (US4), **When** pulsa "Compartir / Exportar PNG", **Then** se genera una imagen PNG del SVG de la constelación con el nombre del jugador y las estrellas en su estado correcto.
2. **Given** el usuario exporta la imagen, **When** se genera, **Then** la imagen NO muestra los logros no desbloqueados ni el progreso interno (solo lo público/visual).

---

### Edge Cases

- ¿Qué pasa cuando dos eventos del mismo tipo llegan concurrentemente y ambos alcanzarían el mismo logro? → La acreditación de recompensa y el `unlockedAt` usan transacción atómica (`updateMany` + condición); solo uno "gana", el otro detecta `count === 0` y no duplica.
- ¿Qué pasa si `current` supera `target` (over-count)? → El incremento solo ocurre si `unlockedAt` es `null` y `current < target`; se recorta a `target`.
- ¿Qué pasa si un logro referencia un `itemId` de item que no existe en el inventario? → El otorgamiento del item falla de forma controlada (log de error) y NO revierte el desbloqueo ni las monedas/gemas (el logro sigue desbloqueado; se reporta).
- ¿Qué pasa si `constellations.json` no tiene una estrella o un `id` que sí está en `achievements.json` (o viceversa)? → La validación de integridad cruzada (hot-reload) rechaza el snapshot; la UI ignora con seguridad las estrellas huérfanas (no las dibuja).
- ¿Qué pasa si el usuario cambia `achievementsPublic` a `true` y luego a `false`? → Es inmediato y se refleja en el siguiente `GET /users/:id/achievements`; no se borra el progreso (solo se oculta).
- ¿Qué pasa con las pets que se eliminan? → El progreso es por USUARIO (no por pet): eliminar una pet no afecta los logros; la relación `User → Achievement` es `onDelete: Cascade` solo si se borra el usuario.
- ¿Qué pasa si la constelación de una categoría tiene más estrellas de lo que `achievements.json` define? → La UI dibuja solo las estrellas que existen en el modelo de datos; el layout extra se ignora.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST devolver la lista completa de logros del usuario con su estado (`locked | in_progress | unlocked`) en `GET /achievements`.
- **FR-002**: El sistema MUST definir exactamente 5 constelaciones/categorías: `care` (Cuidado), `battle` (Batalla), `ai` (IA), `collection` (Colección), `social` (Social), con entre 10 y 15 estrellas (logros) cada una.
- **FR-003**: El sistema MUST trackear el progreso de los logros a partir de eventos de dominio (`pet:fed`, `battle:finished`, `chat:message_sent`, `egg:hatched`, etc.) usando el mismo mecanismo que las misiones (Feature #1), incrementando todos los logros activos que matchean el `event` del logro.
- **FR-004**: El sistema MUST marcar un logro como `unlocked` (setear `unlockedAt`) de forma atómica cuando `current` alcanza `target`, y emitir el evento WebSocket `achievement:unlocked` con `{ id, name, category, tier, reward }`.
- **FR-005**: El sistema MUST acreditar la recompensa (monedas/gemas) de forma atómica y sin duplicación bajo race condition (transacción `updateMany` + condición sobre `unlockedAt`), y para logros `epic`/`legendary` MUST otorgar además un item exclusivo de inventario.
- **FR-006**: El sistema MUST servir el layout de la constelación de cada categoría (`GET /achievements/constellation/{cat}`) con posiciones `{ x, y }` normalizadas [0,1] por estrella, su `status` y las `connections` (pares de `id`) para las líneas SVG.
- **FR-007**: El sistema MUST permitir al usuario activar/desactivar la visibilidad pública de sus logros (`PATCH /me { achievementsPublic }`), con valor por defecto `false`.
- **FR-008**: El sistema MUST exponer el perfil público de logros (`GET /users/:id/achievements?public=true`) solo si `achievementsPublic` es `true`, y entonces MUST incluir únicamente los logros `unlocked` (nunca el `current` de los no desbloqueados).
- **FR-009**: El sistema MUST definir los logros de forma data-driven en `shared/game-data/achievements.json` (`{ id, name, desc, category, target, event, tier, reward }`) y el layout en `shared/game-data/constellations.json`, con validación de esquema (zod) e integridad cruzada en el hot-reload de `GameDataService`.
- **FR-010**: El `tier` de un logro MUST ser uno de `common | rare | epic | legendary`; los `reward` de `epic`/`legendary` MUST poder incluir un `itemId` (item exclusivo cosmético, sin poder de combate).
- **FR-011**: El identificador de usuario MUST provenir siempre de la sesión (JWT / `@CurrentUser`), nunca de un parámetro enviado por el cliente.
- **FR-012**: El frontend (desktop) MUST renderizar la constelación en SVG (estrellas `gray → yellow → bright` por estado, con líneas de conexión), una lista filtrable por categoría y un toast/animación de desbloqueo, y MUST poder exportar la constelación a PNG.
- **FR-013**: El progreso de los logros MUST persistirse en PostgreSQL (modelo `Achievement`), usando Redis (`ach:progress:{userId}:{achId}`) como contador en caliente con flush periódico (~30s) y fallback a PG si Redis no está disponible.
- **FR-014**: El sistema MUST soportar logros mixtos (por usuario y, cuando aplique, condicionados a una rareza/etapa vía el payload del evento), sin que la eliminación de una pet afecte el progreso del usuario [ver preguntas abiertas].

### Key Entities *(include if feature involves data)*

- **Achievement** (nuevo modelo Prisma): Representa el progreso de un logro de un usuario. Atributos: `id` (id lógico del logro, compartido entre usuarios, p. ej. `battle_10_wins`), `userId`, `current` (`@default(0)`), `unlockedAt` (`DateTime?`), `claimed` (`Boolean @default(false)`), `createdAt` (`@default(now())`). Relaciones: N:1 con `User` (`onDelete: Cascade`). Índice: `@@unique([userId, id])` e índice de búsqueda por `userId`.
- **User** (modificación existente): Se le añaden la relación `achievements Achievement[]` y el campo `achievementsPublic Boolean @default(false)`. Ya posee `coins`, `gems` y `accountXp` (cuentas donde se acreditan las recompensas).
- **InventoryItem** (Feature existente, dependiente): Para los items exclusivos de logros `epic`/`legendary` (`reward.itemId`). Si el módulo de inventario no soporta la inserción directa, se stubea y se documenta.
- **achievements.json** (`shared/game-data`): Definiciones de los ~50-75 logros `{ id, name, desc, category, target, event, tier, reward: { coins, gems, xp, itemId? } }`, con `version`.
- **constellations.json** (`shared/game-data`): Layout por categoría `{ care: { name, connections: [[id, id], ...] }, battle: {...}, ... }` y las posiciones `{ x, y }` por estrella (normalizadas [0,1]).
- **Redis keys (transitorias)**: `ach:progress:{userId}:{achId}` (contador en caliente, flush ~30s, fallback a PG).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95% de los usuarios ve su panel de logros en < 2 segundos tras abrir la sección (latencia de `GET /achievements`).
- **SC-002**: El progreso de un logro se refleja en la UI en < 2 segundos tras la acción que lo genera (latencia de `achievement:unlocked` / actualización de progreso).
- **SC-003**: El 100% de los desbloqueos acredita su recompensa de forma atómica y sin duplicarse (0 duplicados en la prueba de race condition de eventos concurrentes).
- **SC-004**: El 100% de los logros `epic`/`legendary` otorga su item exclusivo exactamente una vez (idempotente) al desbloquearse.
- **SC-005**: El 90% de los usuarios con constelaciones activas identifica visualmente qué estrellas faltan para completar una categoría al ver `GET /achievements/constellation/{cat}`.
- **SC-006**: La visibilidad pública respeta la privacidad por defecto: el 100% de los usuarios con `achievementsPublic: false` NO expone su progreso a `GET /users/:id/achievements`.
- **SC-007**: El 90% de los usuarios que exportan su constelación obtiene una imagen PNG válida que refleja correctamente las estrellas iluminadas en < 3 segundos.

## Assumptions

- Se reutiliza el sistema de autenticación existente (Bearer JWT + `@CurrentUser`) y el modelo `User` actual (con `coins`, `gems`, `accountXp`).
- El progreso de los logros es por USUARIO (no por pet): las acciones sobre cualquier pet del usuario incrementan los logros activos. Los logros "mixtos" se resuelven a nivel de usuario (ver preguntas abiertas).
- Los logros son únicos y no repetibles: un logro desbloqueado NO se re-desbloquea ni permite retry (seguir la propuesta del spec).
- Los eventos de dominio ya son emitidos por los módulos existentes (`pet:fed`, `pet:cleaned`, `pet:slept`, `pet:evolved`, `egg:hatched`, `battle:finished`, `minigame:finished`, `chat:message_sent`, `pet:level_up`), el mismo set que consume `MissionTrackingService`. El listener de logros NO bloquea la acción principal (se procesa vía `@OnEvent`, patrón igual al de misiones).
- El módulo `achievements` (NestJS) se crea en `backend/src/achievements/` y se registra en `AppModule` (hoy no existe).
- Los items exclusivos de logros son COSMÉTICOS (skins/accesorios), sin poder de combate (respetando el riesgo del spec: "items exclusivos cosméticos").
- El layout de la constelación está hard-coded en `constellations.json` (no se calcula dinámicamente).
- `EventEmitterModule.forRoot()` y `ScheduleModule.forRoot()` ya están registrados en `AppModule`; se reutilizan.
- El contador en caliente usa Redis con flush ~30s y fallback a PostgreSQL (Redis es acelerante, no requisito — Constitución).
- Esta spec cubre el backend y el contrato de datos (API REST + WebSocket); la UI desktop (`ConstellationView`, `AchievementList`, `AchievementToast`, export PNG) consume esos contratos.
- La conexión "streak → logro" (Feature #1) se resuelve escuchando un evento de streak o consultando el resumen de misiones para los logros tipo racha (ver preguntas abiertas).

## Preguntas abiertas

1. **Logros por pet o por usuario?** → Propuesta del spec: mixto. Decisión de implementación: tracking por USUARIO (coherente con misiones); los logros condicionados a rareza/etapa se evalúan con el payload del evento (p. ej. `egg:hatched` con `rarity`).
2. **Retries?** → Propuesta del spec: NO, una vez. Se implementa como único (no repetible).
3. **Seasonal?** → Propuesta del spec: v2 junto con Feature #11. Fuera de alcance de esta feature (se deja un campo `season?` opcional reservado para el futuro).
4. **Categoría `social`:** no hay un evento de dominio social existente. Propuesta: definir logros de social ligados a eventos que esta feature o el perfil público emiten (p. ej. compartir constelación, activar visibilidad pública), o stubearlos hasta que exista un sistema social. [NEEDS CLARIFICATION]