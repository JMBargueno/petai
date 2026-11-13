# Feature Specification: Cofres y drops aleatorios

**Feature Branch**: `002-cofres-drops`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Crear el sistema de cofres (Bronce, Plata, Oro, Diamante, Mítico) de PetAI que contienen items aleatorios resueltos según tablas de drops por rareza definidas en `balance.json`. Se consiguen con misiones, victorias en Arena, evoluciones, compra directa o eventos especiales, e incluyen un sistema de pity por tipo de cofre que garantiza una rareza mínima tras N aperturas sin drop suficiente, más animaciones de revelación e historial de aperturas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver mis cofres no abiertos en el grid (Priority: P1)

Como jugador, al abrir la sección de cofres quiero ver el grid de mis cofres no abiertos, cada uno coloreado por su tipo (bronze, silver, gold, diamond, mythic) y con su fuente, para saber qué puedo abrir ahora.

**Why this priority**: Es la base de la interacción: sin ver los cofres no hay forma de abrirlos ni de comprar más. Es la puerta de entrada al bucle de micro-recompensa sobre el que se construyen el resto de las historias.

**Independent Test**: Se testea creando 1 o más `Chest` del usuario (vía el job `chests:create` o seed directo) y llamando a `GET /chests` con un Bearer token válido, verificando que la respuesta `200` lista cada cofre no abierto con `id`, `type`, `source` y `createdAt`, y que los cofres ya abiertos no aparecen.

**Acceptance Scenarios**:

1. **Given** un usuario con 3 cofres no abiertos (bronze, gold, diamond) y 2 ya abiertos, **When** llama a `GET /chests`, **Then** el sistema devuelve `200: { chests: [3 elementos] }` donde cada cofre no abierto expone `id`, `type`, `source` y `createdAt`, y excluye los 2 abiertos.
2. **Given** un usuario sin ningún cofre, **When** llama a `GET /chests`, **Then** el sistema devuelve `200: { chests: [] }`.
3. **Given** una petición a `GET /chests` sin token o con token inválido, **When** se procesa, **Then** el sistema responde `401 Unauthorized`.

---

### User Story 2 - Abrir un cofre y ver la revelación de los drops (Priority: P2)

Como jugador, quiero tocar un cofre y ver una animación de revelación (spin → reveal + partículas) que muestre los items que caen, para sentir la emoción del "¿qué caerá?".

**Why this priority**: Es el "instant of value" de toda la feature: el bucle completo de micro-recompensa y la dopamina del drop. Sin abrir, el cofre no entrega ningún valor, por lo que es la pieza central del MVP.

**Independent Test**: Se testea con un `Chest` creado y no abierto, llamando a `POST /chests/open` con su `chestId` y verificando que la respuesta `200` incluye `chest`, `drops` (lista no vacía de `{ itemId, name, qty, tier, isNew }`) y `pityProgress`, que los items quedaron acreditados en `InventoryItem` y que `Chest.openedAt` quedó poblado.

**Acceptance Scenarios**:

1. **Given** un `Chest` de tipo `bronze` no abierto, **When** el usuario llama a `POST /chests/open` con `{ "chestId": "<uuid>" }`, **Then** el sistema devuelve `200: { chest, drops: [{ itemId, name, qty, tier, isNew }], pityProgress }`, resuelve los drops de forma autoritativa con `crypto.randomInt` sobre la tabla `balance.json → chests.bronze`, los suma de forma atómica a `InventoryItem` y setea `Chest.openedAt`.
2. **Given** un `chestId` que no existe o no pertenece al usuario, **When** llama a `POST /chests/open`, **Then** el sistema responde `404 Not Found` y no altera el inventario ni el pity.
3. **Given** un `Chest` ya abierto (`openedAt` poblado), **When** el usuario vuelve a llamar a `POST /chests/open`, **Then** el sistema responde `409 Conflict` y no duplica drops.
4. **Given** un mismo cofre con dos peticiones de apertura simultáneas, **When** ambas llaman a `POST /chests/open` a la vez, **Then** solo una responde `200` y la otra `409` (apertura idempotente, race-condition segura).
5. **Given** un usuario con una conexión WebSocket activa, **When** abre un cofre, **Then** se emite el evento `chest:opened { chestId, type, drops }`.

---

### User Story 3 - Comprar cofres con monedas o gemas (Priority: P3)

Como jugador, quiero comprar cofres de bronce, plata u oro directamente con mis monedas o gemas desde la tienda, para no depender solo de misiones o batallas.

**Why this priority**: Es la vía de adquisición directa y conecta la feature con la economía del juego (monedas/gemas). Sin ella, los jugadores sin suerte en las misiones no tendrían una forma fiable de obtener cofres, limitando el FOMO que la feature debe generar.

**Independent Test**: Se testea con un usuario que tiene saldo (`User.coins` y `User.gems`), llamando a `POST /chests/purchase` con `{ "type": "bronze", "paymentMethod": "coins" }` y verificando que se crea un cofre inactivo, que el saldo se descuenta de forma atómica y que la respuesta `200` incluye `coinsRemaining` y `gemsRemaining`.

**Acceptance Scenarios**:

1. **Given** un usuario con `coins: 100` y `gems: 5`, **When** llama a `POST /chests/purchase` con `{ "type": "bronze", "paymentMethod": "coins" }`, **Then** el sistema crea un `Chest` de tipo `bronze` y `source: "purchase"` no abierto, descuenta el precio en monedas de forma atómica y responde `200: { chest, coinsRemaining, gemsRemaining }`.
2. **Given** un usuario cuyo saldo (monedas o gemas) es inferior al precio del cofre solicitado, **When** llama a `POST /chests/purchase`, **Then** el sistema responde `400 Bad Request` (saldo insuficiente) y no crea ningún cofre ni descuenta nada.
3. **Given** un usuario que ya realizó 5 compras de cofres ese día, **When** intenta una 6ª compra, **Then** el sistema responde `409 Conflict` (límite de 5 compras/día) y no crea el cofre.
4. **Given** un `paymentMethod` o `type` no válido (p. ej. `"diamond"`, `"mythic"` o un método inexistente), **When** llama a `POST /chests/purchase`, **Then** el sistema responde `400 Bad Request` (solo se pueden comprar bronze, silver y gold).

---

### User Story 4 - Garantía de rareza mínima tras N aperturas (pity) (Priority: P4)

Como jugador, quiero que tras una racha de aperturas de un tipo de cofre sin item suficientemente raro, la siguiente me garantice al menos esa rareza mínima, para no quedarme enganchado por mala suerte.

**Why this priority**: Es la protección anti-frustración que hace sostenible el bucle de drops aleatorios: convierte la varianza en una expectativa garantizada. No bloquea el MVP básico, pero es esencial para la retención, por lo que va justo después de las historias centrales.

**Independent Test**: Se testea sembrando un `ChestPity` del usuario con `count = threshold` para un tipo de cofre y abriendo uno de ese tipo, verificando que el drop garantizado es de tier >= `minTier` y que el contador `count` se resetea a `0`.

**Acceptance Scenarios**:

1. **Given** un `ChestPity` de tipo `bronze` con `count = 10` (equal al `threshold`) y `minTier: "rare"`, **When** el usuario abre un cofre bronze, **Then** el drop resultante es de tier >= `rare` (garantizado), y `ChestPity.count` se resetea a `0`.
2. **Given** un `ChestPity` de tipo `bronze` con `count = 9` (un por debajo del `threshold`), **When** el usuario abre un cofre bronze y cae un item `common`, **Then** no se aplica la garantía, y `ChestPity.count` incrementa a `10`.
3. **Given** un `ChestPity` con `count = 4` para un tipo de cofre, **When** el usuario abre un cofre de ese tipo y el drop es de tier >= `minTier`, **Then** `ChestPity.count` se resetea a `0` aunque no se haya alcanzado el `threshold`.

---

### User Story 5 - Ver el historial de mis aperturas (Priority: P5)

Como jugador, quiero ver la lista paginada de mis aperturas de cofres (fecha, tipo e items obtenidos) para recordar qué conseguí.

**Why this priority**: Es un valor retroactivo de transparencia y nostalgia ("mi gran drop"). No es necesario para el bucle básico de abrir, por lo que tiene menor prioridad y puede entregarse como una mejora posterior.

**Independent Test**: Se testea abriendo N cofres y llamando a `GET /chests/history?limit=50&offset=0`, verificando que la respuesta `200` lista las aperturas con `chestId`, `type`, `drops` y `openedAt` ordenadas por fecha y con un `total` correcto.

**Acceptance Scenarios**:

1. **Given** un usuario con 120 aperturas registradas, **When** llama a `GET /chests/history?limit=50&offset=0`, **Then** el sistema devuelve `200: { openings: [50 elementos], total: 120 }` ordenado por `openedAt` descendente.
2. **Given** un usuario con 3 aperturas, **When** llama a `GET /chests/history?limit=50&offset=0`, **Then** el sistema devuelve `200: { openings: [3 elementos], total: 3 }`.
3. **Given** un usuario sin aperturas, **When** llama a `GET /chests/history?limit=50`, **Then** el sistema devuelve `200: { openings: [], total: 0 }`.

---

### User Story 6 - Ver la rareza mínima garantizada antes de comprar (Priority: P6)

Como jugador, quiero ver qué rareza mínima puedo obtener de un tipo de cofre (y mi progreso de pity actual) antes de comprarlo, para tomar una decisión informada.

**Why this priority**: Reduce el riesgo percibido de la compra y comunica el sistema de pity, reforzando la confianza y el FOMO. Es un valor informativo/UX que no bloquea la funcionalidad central de abrir ni comprar.

**Independent Test**: Se testea llamando a `GET /chests` (o al detalle de un tipo de cofre) para un usuario con pity en progreso y verificando que la respuesta expone la rareza mínima de la tabla de drops del tipo y el `pityProgress` actual.

**Acceptance Scenarios**:

1. **Given** un usuario con `ChestPity` de tipo `bronze` en `count = 7` y `minTier: "rare"`, **When** consulta la información de los cofres para comprar, **Then** el sistema expone la rareza mínima de la tabla del tipo y el `pityProgress { count: 7, threshold: 10, minTier: "rare" }`.
2. **Given** un usuario sin pity (sin `ChestPity` para un tipo), **When** consulta la información de compra, **Then** el `pityProgress` de ese tipo se muestra en `count: 0`.

---

### User Story 7 - Cofres míticos solo en eventos especiales (Priority: P7)

Como jugador, quiero que los cofres míticos (y los diamantes) solo estén disponibles en eventos especiales o temporada/raid, para que sean objetos de alto valor y no algo común de comprar.

**Why this priority**: Preserva el valor y la progresión de las rarezas altas (economía + FOMO de largo plazo). Es una restricción de balance/monetización que no afecta el flujo diario, por lo que se entrega con menor prioridad.

**Independent Test**: Se testea verificando que `POST /chests/purchase` rechaza `diamond` y `mythic` (400) y que un `Chest` de tipo `mythic` solo puede crearse con `source: "event"` vía el job `chests:create`.

**Acceptance Scenarios**:

1. **Given** cualquier usuario, **When** llama a `POST /chests/purchase` con `{ "type": "mythic", ... }`, **Then** el sistema responde `400 Bad Request` (los míticos no son comprables).
2. **Given** un evento activo que otorga un cofre mítico, **When** el sistema procesa la recompensa vía el job `chests:create`, **Then** se crea un `Chest` de tipo `mythic` con `source: "event"` (no a través de `purchase`).
3. **Given** un usuario que gana una batalla en Arena, **When** el sistema evalúa la recompensa por victoria (10% de probabilidad), **Then** en caso de éxito se crea un `Chest` con `source: "battle"` y se emite `chest:unlocked { chestId, type, source }`.

---

### Edge Cases

- **Apertura concurrente (race condition)**: Si dos peticiones de `POST /chests/open` para el mismo cofre llegan simultáneamente, la transacción debe garantizar que solo una se completa (la que setea `openedAt`) y la otra recibe `409 Conflict`. Nunca deben generarse dos conjuntos de drops.
- **Drop con qty > 99**: Si el rango de qty de un item produce una cantidad mayor a 99, el excedente se convierte a monedas y no se guarda en `InventoryItem` con qty > 99.
- **Saldo insuficiente en compra**: Si el descuento del precio haría negativo `User.coins` o `User.gems`, la compra se rechaza con `400` y no se crea el cofre ni se descuenta nada (validación y descuento atómicos).
- **Límite de compras/día**: Tras 5 compras de `POST /chests/purchase` en el mismo día (por timezone del usuario), la 6ª devuelve `409 Conflict`. El conteo se resetea a la medianoche local del usuario.
- **Pity justo en el umbral (N-1 vs N)**: Con `count = threshold - 1` no aplica la garantía (solo incrementa); con `count = threshold` la siguiente apertura garantiza el `minTier` y resetea. El test debe cubrir ambos casos.
- **Cofre caducado**: Un cofre no abierto por más de 30 días es convertido a monedas por el job diario `chests:cleanup` y eliminado; si el usuario intenta abrirlo después, recibe `404`.
- **Tier mítico/diamante por fuera de eventos**: `mythic` y `diamond` no deben ser creables vía `purchase`; solo vía `event` (mythic) o temporada/raid (diamond). Intentar comprarlos devuelve `400`.
- **Usuario sin conexión WebSocket al abrir**: La apertura (`POST /chests/open`) debe completar exitosamente y persistir drops aunque no haya un cliente conectado; el evento `chest:opened` se emite solo si hay conexión activa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST return the requesting user's unopened chests via `GET /chests` as `200: { chests: [{ id, type, source, createdAt }] }`, excluding already-opened chests.
- **FR-002**: System MUST return `401 Unauthorized` when `GET /chests`, `POST /chests/open`, `POST /chests/purchase` or `GET /chests/history` is called without a valid Bearer token.
- **FR-003**: System MUST accept a `chestId` in `POST /chests/open` and return `200: { chest, drops: [{ itemId, name, qty, tier, isNew }], pityProgress }`.
- **FR-004**: System MUST resolve chest drops server-side (authoritative) using `crypto.randomInt` as a weighted roll over the chest type's drop table in `balance.json → chests.{type}`, and MUST NOT accept drop results or tier values from client input (anti-cheat).
- **FR-005**: System MUST add the obtained items to the user's `InventoryItem` atomically (upsert by `[userId, itemId]`, incrementing `qty`), in the same database transaction as setting `Chest.openedAt` and updating `ChestPity.count`.
- **FR-006**: System MUST return `404 Not Found` when the `chestId` in `POST /chests/open` does not exist or does not belong to the requesting user, and `409 Conflict` when the chest is already opened, including under concurrent open requests (idempotent open).
- **FR-007**: System MUST maintain pity per user and per chest type: after `threshold` consecutive openings without a drop of tier >= `minTier`, the next opening MUST guarantee at least that `minTier`, and MUST reset the `ChestPity.count` to `0` whenever a qualifying drop (tier >= `minTier`) occurs.
- **FR-008**: System MUST accept `POST /chests/purchase` with `{ "type": "bronze|silver|gold", "paymentMethod": "coins"|"gems" }`, create an unopened chest with `source: "purchase"`, and decrement the user's balance atomically, returning `200: { chest, coinsRemaining, gemsRemaining }`.
- **FR-009**: System MUST return `400 Bad Request` when the user's coins/gems are insufficient for the requested chest, and `409 Conflict` when the user has already made 5 or more chest purchases on that day (per the user's local timezone).
- **FR-010**: System MUST restrict `POST /chests/purchase` to types `bronze`, `silver` and `gold`; `diamond` and `mythic` MUST NOT be purchasable and MUST return `400 Bad Request` (mythic only via events, diamond via season/raid).
- **FR-011**: System MUST return the user's most recent openings via `GET /chests/history?limit=&offset=` as `200: { openings: [{ chestId, type, drops, openedAt }], total }`, ordered by `openedAt` descending and capped at the last 100 openings.
- **FR-012**: System MUST emit the WebSocket event `chest:unlocked { chestId, type, source }` when a chest is created, and `chest:opened { chestId, type, drops }` when a chest is opened (only when a client connection is active).
- **FR-013**: System MUST create chests asynchronously via the `chests:create` BullMQ job so that the triggering action (mission completion, battle win, evolution, event) is not blocked.
- **FR-014**: System MUST run a daily `chests:cleanup` job that converts chests unopened for more than 30 days into coins and deletes them.
- **FR-015**: System MUST cap each drop's quantity at 99; if a computed `qty` exceeds 99, the excess MUST be converted to coins instead of being stored in `InventoryItem`.
- **FR-016**: System MUST persist chest state (`Chest`, `ChestPity`) and granted items (`InventoryItem`) in PostgreSQL.
- **FR-017**: System MUST define an independent drop table per chest type in `balance.json → chests` with probabilities per tier (`common, uncommon, rare, epic, legendary`), qty ranges, and a pity `threshold` / `minTier`.
- **FR-018**: System MUST grant chests from the configured sources: daily missions (all daily complete), Arena win (10% chance, `source: "battle"`), evolution (`source: "evolution"`, gold chest), direct purchase (`source: "purchase"`), and special events (`source: "event"`, mythic).
- **FR-019**: System MUST set the coin/gem prices of each purchasable chest type [NEEDS CLARIFICATION: los valores de precio de bronze/silver/gold en coins/gems aún no están definidos; se autoren en la nueva sección `balance.json → chests` antes de implementar `POST /chests/purchase`].

### Key Entities *(include if feature involves data)*

- **Chest** (nuevo modelo Prisma): Representa un cofre del usuario. Atributos: `id`, `userId`, `type` (`bronze | silver | gold | diamond | mythic`), `source` (`daily_mission | battle | evolution | purchase | event`), `openedAt` (`DateTime?`, `null` hasta que se abre), `drops` (`Json?`, los drops resueltos al abrir), `createdAt`. Relaciones: N:1 con `User` (`onDelete: Cascade`). Índice: `[userId, openedAt]`.
- **ChestPity** (nuevo modelo Prisma): Representa el progreso de pity de un usuario por tipo de cofre. Atributos: `id`, `userId`, `tier` (almacena el tipo de cofre: `bronze | silver | gold | diamond | mythic`), `count` (aperturas consecutivas sin drop de `minTier`, `@default(0)`). Único por `[userId, tier]`. Relaciones: N:1 con `User` (`onDelete: Cascade`). Es independiente del `PityCounter` ya existente (que gestiona el pity de eclosión de pets).
- **User** (modificación existente): Se le añaden las relaciones `chests Chest[]` y `chestPity ChestPity[]`. Ya posee `coins` (saldo en monedas), `gems` (saldo en gemas) y `timezone` (clave para el límite de 5 compras/día y la caducidad).
- **InventoryItem** (existente): Donde se acreditan los items de los drops, upsert por `[userId, itemId]` incrementando `qty`. Relación N:1 con `User` e `Item`.
- **Item** (existente): Catálogo de items (comida, medicina, huevos, skins, etc.) a los que apuntan los drops.
- **balance.json → chests** (nueva sección en `shared/game-data`): Tablas de drops por tipo de cofre (`items`, `weights` por tier, `qty ranges`, `pity.threshold` y `pity.minTier`). Los tiers de drop (`common, uncommon, rare, epic, legendary`) son distintos de los tiers de rareza de pet (`normal, rare, super_rare, legendary, mythic`) ya existentes en `balance.json → rarity`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las aperturas resuelve los drops de forma autoritativa en el servidor (0 drops resueltos por el cliente); una simulación de 100k aperturas con DevKit muestra la distribución real de drops dentro de ±5% de los pesos configurados por tier.
- **SC-002**: La garantía de pity es determinista: tras `threshold` aperturas consecutivas con drop por debajo de `minTier`, la apertura `threshold + 1` produce un drop de tier >= `minTier` en el 100% de los casos (verificado con 10k corridas simuladas).
- **SC-003**: `POST /chests/open` responde en < 300ms (p95) incluyendo la resolución de drops y la actualización del inventario en una única transacción.
- **SC-004**: Las aperturas dobles/concurrentes del mismo cofre producen exactamente una apertura exitosa (la otra responde `409`) en el 100% de las pruebas de race-condition.
- **SC-005**: El valor medio de los drops de cofres es ≈ 60% del valor de la compra directa (objetivo de balance), validado por la simulación de 100k aperturas.
- **SC-006**: Consistencia de inventario: 0 grants huérfanos (cada `Chest.drops` tiene un delta correspondiente en `InventoryItem`) verificado por las pruebas de integración.

## Assumptions

- Se reutiliza el sistema de autenticación Bearer existente del backend; un token ausente o inválido devuelve `401` (misma convención que Feature #1 — misiones).
- Los tiers de drop de los cofres (`common, uncommon, rare, epic, legendary`) son un sistema separado de los tiers de rareza de pet (`normal, rare, super_rare, legendary, mythic`) en `balance.json → rarity`.
- Los cofres caducan: un cofre no abierto por más de 30 días se convierte a monedas (propuesta aceptada de las preguntas abiertas), gestionado por el job diario `chests:cleanup`.
- Los drops son irreversibles: no existe deshacer/rollback de una apertura (propuesta aceptada).
- Los cofres no son compartibles entre jugadores en v1 (propuesta aceptada).
- Solo bronze, silver y gold son comprables vía `POST /chests/purchase`; el cofre `diamond` se obtiene por temporada/raid y el `mythic` únicamente en eventos especiales.
- Los precios en coins/gems de bronze/silver/gold, y los valores de items/weights/qty de las tablas de drop, se autoren en la nueva sección `balance.json → chests` durante la implementación (no están definidos en este spec).
- Los triggers de `battle` (10% de probabilidad por victoria en Arena) y de `evolution` (cofre gold) reutilizan los módulos existentes de `battles` y `evolve`.
- Los jobs `chests:create` y `chests:cleanup` se ejecutan sobre la infraestructura BullMQ ya existente del backend.
- DevKit (Feature #4) es el medio para simular y validar el balance de drops.
- Los componentes frontend `ChestGrid`, `ChestOpening` (animación de revelación) y `ChestHistory` se implementan en los clientes mobile/desktop correspondientes.