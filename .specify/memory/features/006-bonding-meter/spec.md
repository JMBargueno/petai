# Feature Specification: Bonding Meter (Métrico de Vínculo)

**Feature Branch**: `006-bonding-meter`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Métrico de vínculo jugador-pet (0-100) que sube con interacciones variadas y baja si el jugador lo ignora >48h. Rangos: \"Acostumbrado\" → \"Compañero\" → \"Aliado\" → \"Alma gemela\" → \"Leyenda\". Conecta con las vitales del `Pet`, el prompt/personalidad de la IA y las animaciones del escritorio. Se calcula de forma autoritativa en el backend y se integra en el lazy tick existente."

## User Scenarios & Testing *(mandatory)*

> Historias priorizadas como journeys independientes y testeables. Cada una es un MVP por sí sola: se puede desarrollar, testear, desplegar y demostrar de forma aislada.

### User Story 1 - "El vínculo sube con lo que hago" (Priority: P1)

Como jugador, quiero que mi vínculo con mi pet (una barra 0-100) suba cada vez que le dedico una acción variada —alimentarlo, pelear, un minijuego, chatear, bañarlo, dormirlo o evolucionarlo—, para tener un objetivo de largo plazo que premie la **consistencia** y la **variedad** (no solo pelear), y para verlo reflejado al instante en una barra con su rango ("Acostumbrado", "Compañero", …).

**Why this priority**: Es el núcleo de la feature: sin la subida del vínculo y sin poder verlo (`bonding` + `bondingTier` en `GET /pets/:id`), no existe el métrico ni hay nada que medir. Todo lo demás (decaimiento, IA por umbral, recompensas) se apoya sobre este valor. Es el MVP.

**Independent Test**: Se testea sin UI ni sin reloj simulado: al invocar una interacción (p. ej. `feed`) se verifica que `Pet.bonding` sube en el incremento de `balance.bonding.interactions.feed` (+2) y que se crea una fila `BondingEvent`; al llamar a `GET /pets/:id` se verifica que la respuesta incluye `bonding`, `bondingTier` (calculado según `balance.bonding.tiers`) y `lastInteractionAt`; y que al cruzar un umbral (p. ej. 29→30) se emite el WS `bonding:tier_up` y el valor nunca supera 100 ni baja de 0.

**Acceptance Scenarios**:

1. **Given** un pet con `bonding = 28`, **When** el jugador lo alimenta (`feed`), **Then** el backend aplica `+2` (de `balance.bonding.interactions.feed`), `bonding` pasa a 30, `bondingTier` cambia de `acquainted` a `companion` y se persiste una `BondingEvent` con `delta = +2` y `reason = "feed"`.
2. **Given** un pet con `bonding = 98`, **When** el jugador lo alimenta (`+2`), **Then** `bonding` queda acotado a `100` (cap superior), nunca a 100.2, y se registra la `BondingEvent` con el `value` real resultante.
3. **Given** un pet recién eclosionado con `bonding = 0`, **When** el jugador juega un minijuego (`+2`) y después pelea (`+3`), **Then** `bonding` sube a 5 acumulando ambas interacciones y cada una produce su propia `BondingEvent`.
4. **Given** un pet con `bonding = 29` y `bondingTier = "acquainted"`, **When** una interacción lo lleva a 30, **Then** se emite el evento WebSocket `bonding:tier_up` con `{ petId, oldTier: "acquainted", newTier: "companion", bonding: 30 }` y `GET /pets/:id` ya reporta `bondingTier = "companion"`.
5. **Given** un pet con `bonding = 30`, **When** el jugador llama a `GET /pets/:id` (token válido), **Then** la respuesta incluye `bonding = 30`, `bondingTier = "companion"` y `lastInteractionAt` (ISO-8601), sin que el cliente tenga que calcular nada.

---

### User Story 2 - "Si me voy, el vínculo se enfría" (Priority: P2)

Como jugador, quiero que mi vínculo **baje** de forma gradual si lo abandono más de 48h (pero no si regreso en menos de 24h), y que pueda consultar el detalle completo (valor, rango, historial de eventos y cuánto me falta/decaye) para entender el "costo emocional" del abandono sin que sea punitivo.

**Why this priority**: Aporta la segunda mitad del métrico —la presión de abandono— y el endpoint dedicado de detalle (`GET /pets/:id/bonding`). Depende del valor y del rango de US1, pero es independiente en cuanto a lógica: el decaimiento se resuelve dentro del lazy tick y el endpoint agrega la información agregada (historial + `decayInfo`).

**Independent Test**: Se testea simulando `lastInteractionAt` sin tocar interacciones: con `lastInteractionAt` a 49h y `bonding = 50`, al leer el pet se aplica el decaimiento acumulado (`decayRatePerDay` × días transcurridos sobre la ventana de inactividad) y `bonding` baja a un valor mayor que 0; con `lastInteractionAt` a 20h el vínculo **no** decae; y `GET /pets/:id/bonding` devuelve `{ value, tier, history, decayInfo }`. Si el decaimiento empuja a otro rango, se emite `bonding:tier_down` y, si decae más de 1 punto, `bonding:decay`.

**Acceptance Scenarios**:

1. **Given** un pet con `bonding = 50`, `lastInteractionAt` hace 20h y `lastTickAt` reciente, **When** cualquier lectura dispara `applyLazyTick`, **Then** el vínculo **no** decae (ventana de gracia: el decaimiento solo aplica tras >48h sin interacción) y `bonding` permanece en 50.
2. **Given** un pet con `bonding = 50` y `lastInteractionAt` hace 72h, **When** el jugador vuelve y se dispara `applyLazyTick`, **Then** se aplica `balance.bonding.decayRatePerDay` (0.5) por cada día completo de inactividad sobre la ventana elegible, `bonding` baja de forma proporcional y se registra una `BondingEvent` con `delta < 0` y `reason = "decay"`.
3. **Given** un pet con `bonding = 5` y decaimiento acumulado que superaría 0, **When** se aplica el tick, **Then** `bonding` queda acotado a `0` (floor), nunca negativo, y `bondingTier` es `acquainted`.
4. **Given** un pet con `bonding = 61` (`ally`), **When** el decaimiento por abandono lo lleva a 59 (`companion`), **Then** se emite `bonding:tier_down` y, al exceder el umbral de 1 punto de caída, también `bonding:decay` con el nuevo `bonding`.
5. **Given** un pet con 6 `BondingEvent` recientes, **When** el jugador llama a `GET /pets/:id/bonding`, **Then** la respuesta incluye `value`, `tier`, `history` (lista paginada de eventos con `delta`, `reason`, `value`, `createdAt`) y `decayInfo` (tasa/día, si decae ahora, y horas restantes para que empiece a decaer).

---

### User Story 3 - "Cuanto más nos unimos, más me conoce" (Priority: P3)

Como jugador, quiero que la IA de mi pet **reaccione** a mi nivel de vínculo: que me salude al iniciar sesión al llegar a "Compañero" (30+), que **recuerde conversaciones previas** al llegar a "Aliado" (60+, reutilizando `PetMemory`), que muestre reacciones emocionales personalizadas a "Alma gemela" (80+), y que al alcanzar "Leyenda" (100) desbloquee un patrón exclusivo y que duerma cerca de mi cursor.

**Why this priority**: Es la capa de **transformación** que da valor emocional al métrico y justifica perseguirlo: conecta el valor del vínculo con el prompt/personalidad de la IA y con las recompensas visuales. Depende de US1 (rango) y US2 (estado estable), pero su lógica es independiente: se inyecta `bondingTier` al prompt y se condiciona el recuerdo/animaciones por umbral.

**Independent Test**: Se testea fijando `bonding`/`bondingTier` en el pet y verificando el output: con `bondingTier = "ally"` (60+), `chat.service` inyecta el bloque de `PetMemory` en el `systemPrompt` (como ya hace con `MEMORY_UNLOCK` de inteligencia); con `"soulmate"` (80+) el prompt lleva una línea de reacciones emocionales; y con `bonding = 100` (`legend`) el endpoint expone el desbloqueo del patrón exclusivo y la flag de "duerme cerca del cursor" para que el escritorio lo anime. El saludo de 30+ se verifica por un campo `greeting`/flag de bienvenida en `GET /pets/:id/bonding`.

**Acceptance Scenarios**:

1. **Given** un pet con `bondingTier = "companion"` (30+), **When** el jugador inicia sesión, **Then** el pet saluda (el contrato expone una señal de saludo para la UI) y la UI puede disparar la animación de saludo.
2. **Given** un pet con `bondingTier = "ally"` (60+) y recuerdos guardados en `PetMemory`, **When** el jugador chatea, **Then** `buildSystemPrompt` incluye `bondingTier` y se inyecta el bloque de memoria (`memory.recall`) en el `systemPrompt`, igual que con `intelligence >= MEMORY_UNLOCK`.
3. **Given** un pet con `bondingTier = "soulmate"` (80+), **When** el jugador chatea, **Then** el `systemPrompt` añade una directiva de reacciones emocionales personalizadas (tono más cercano) sin romper el carácter base (rasgo + mood).
4. **Given** un pet con `bonding = 100` (`legend`), **When** se consulta su estado de vínculo, **Then** el contrato indica `patternUnlocked = true` (patrón exclusivo) y `sleepNearCursor = true`, que el escritorio consume para animar.
5. **Given** un pet con `bondingTier` por debajo de 30, **When** el jugador chatea, **Then** **no** se inyecta memoria ni reacciones por vínculo (solo el prompt base), para que los umbrales sean significativos.

---

### Edge Cases

- **Cap superior**: `bonding` nunca excede 100. Un `+5` (evolve) desde 97 deja 100, no 102.
- **Floor**: el decaimiento nunca deja `bonding < 0`; queda en 0 y el tier es `acquainted`.
- **Tier down (no punitivo)**: al perder rango el pet "se decepciona" (frase de IA, tono suave). No hay castigo de gameplay, solo emocional.
- **Multi-pet**: cada pet tiene su propio `bonding`/`bondingTier`/`lastInteractionAt` e historial; una interacción sobre un pet no afecta a los demás.
- **Coexistencia con inteligencia**: el recuerdo de IA se inyecta si `bondingTier >= ally` **o** `intelligence >= MEMORY_UNLOCK` (OR, idempotente — el bloque de memoria no se duplica).
- **Evolución no borra el vínculo**: al evolucionar el pet, `bonding` se conserva (la evolución además otorga +5).
- **Interacción sobre pet dormido**: sigue el mismo guard que `feed`/`clean` (si la acción está prohibida por `sleeping`, tampoco otorga vínculo); `sleep` (+0.5) es la única que aplica sobre dormido.
- **Precisión de `Float`**: el decaimiento por día se calcula con fracciones (p. ej. 0.5 × 1.25 días) y se redondea a 2 decimales al persistir para evitar deriva en la barra.
- **Doble lectura del tick**: `applyLazyTick` es idempotente en el decaimiento de vínculo (re-fija la base de referencia tras aplicar), de modo que dos lecturas en corto no acumulan el mismo decaimiento dos veces.
- **Perfil público** (pregunta abierta, propuesta): si se muestra, se expone **solo el tier**, nunca el valor exacto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mantener en `Pet` los campos `bonding Float @default(0)`, `bondingTier String @default("acquainted")` y `lastInteractionAt DateTime @default(now())`, y una relación 1-N con `BondingEvent`.
- **FR-002**: El sistema MUST incrementar `bonding` en el monto definido por `balance.bonding.interactions[<type>]` ante cada interacción: `feed +2`, `battle +3`, `minigame +2`, `chat +1`, `clean +1`, `sleep +0.5`, `evolve +5`.
- **FR-003**: El sistema MUST acotar `bonding` al rango `[0, 100]` en todo incremento y decaimiento.
- **FR-004**: El sistema MUST calcular `bondingTier` a partir de `balance.bonding.tiers[]` (intervalos) y actualizarlo cuando el valor cruza un umbral.
- **FR-005**: El sistema MUST registrar una `BondingEvent` (delta, reason, value resultante, timestamp) por cada cambio de `bonding` (incremento y decaimiento).
- **FR-006**: El sistema MUST aplicar decaimiento (`balance.bonding.decayRatePerDay` = 0.5/día) dentro del `applyLazyTick` existente **solo** cuando `now − lastInteractionAt > 48h`; no debe decaer si han pasado <24h (ventana de gracia).
- **FR-007**: `GET /pets/:id` MUST incluir `bonding`, `bondingTier` y `lastInteractionAt`.
- **FR-008**: `GET /pets/:id/bonding` MUST retornar `{ value, tier, history, decayInfo }`, con `history` paginada y `decayInfo` indicando tasa/día y si el vínculo decae en este tick.
- **FR-009**: El sistema MUST emitir el WS `bonding:tier_up` al subir de rango y `bonding:tier_down` / `bonding:decay` al bajar (este último si la caída supera 1 punto), vía `RealtimeGateway`.
- **FR-010**: El `systemPrompt` de la IA MUST incluir `bondingTier`; en `ally` (60+) o `intelligence >= MEMORY_UNLOCK` MUST inyectar el bloque de `PetMemory`; en `soulmate` (80+) MUST añadir reacciones emocionales personalizadas.
- **FR-011**: En `companion` (30+) el contrato MUST exponer una señal de saludo de bienvenida para la UI.
- **FR-012**: En `legend` (100) el contrato MUST exponer `patternUnlocked` (patrón exclusivo) y `sleepNearCursor` para animaciones del escritorio.
- **FR-013**: El identificador del pet y del usuario MUST provenir de la sesión (`@CurrentUser`/JWT), nunca de un parámetro del cliente; el `type` de interacción MUST validarse contra el conjunto conocido de `balance.bonding.interactions`.
- **FR-014**: El incremento y el decaimiento MUST resolverse de forma autoritativa en el backend dentro de una transacción que no permita dos peticiones concurrentes de la misma interacción duplicar el incremento.
- **FR-015**: El vínculo MUST conservarse tras una evolución (no se resetea).

### Key Entities *(include if feature involves data)*

- **Pet** (existente, ampliado): representa la mascota. Nuevos atributos: `bonding` (0-100), `bondingTier` (string), `lastInteractionAt` (DateTime). Relación 1-N → `BondingEvent`.
- **BondingEvent** (nueva): representa un cambio puntual del vínculo de un pet. Atributos: `id`, `petId` (FK → Pet, cascade), `delta` (Float, signado), `reason` (string: feed/battle/minigame/chat/clean/sleep/evolve/decay), `value` (Float, resultado resultante), `createdAt`. Índice `[petId, createdAt]` para el historial paginado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El jugador ve su vínculo actualizado en la barra en <1s tras cualquier interacción (latencia de `GET /pets/:id` <100ms p95, más el push WS `bonding:tier_up`).
- **SC-002**: El vínculo alcanza 100 ("Leyenda") en ~30-60 días de uso diario con interacción variada (balance: mezcla realista de feed/battle/chat/minigame/evolve).
- **SC-003**: 100% de los incrementos y decaimientos quedan auditables: cada cambio produce exactamente una `BondingEvent` con `delta` y `value` coherentes (`value − value_prev = delta` dentro de redondeo de 2 decimales).
- **SC-004**: El decaimiento respeta la ventana de gracia: 0 decaimientos con inactividad <24h y decaimiento proporcional (>0) con inactividad >48h en las pruebas de integración.
- **SC-005**: Al cruzar cada umbral de tier (30/60/80/100) se emite exactamente un `bonding:tier_up`; al perder rango se emite `bonding:tier_down`. Sin duplicados ni pérdidas bajo lectura concurrente.
- **SC-006**: La IA con `bondingTier = ally` inyecta memoria en el 100% de los mensajes de chat donde hay `PetMemory` relevante; con `soulmate` el prompt siempre incluye la directiva de reacciones.
- **SC-007**: Multi-pet: un incremento sobre un pet no modifica el `bonding` de los otros pets del mismo usuario en el 100% de los casos.

## Assumptions

- El `lazy tick` de vitales ya existe (`pets.service.ts → applyLazyTick`); el decaimiento de vínculo se incorpora a la misma pasada, no se crea un cron/cola por pet (Constitución IV y IX).
- `PetMemory` y `buildSystemPrompt` ya existen en el módulo `ai`; el bonding reutiliza el mecanismo de `memory.recall` y añade `bondingTier` al prompt (no se reimplementa la memoria).
- Las constantes de incrementos, tasa de decaimiento y umbrales viven en `shared/game-data/balance.json → bonding` (no en literales), versionable sin tocar el motor (Constitución VII).
- La identidad de usuario/pet viene de la sesión JWT (`@CurrentUser`); el tipo de interacción se valida en el servidor (Constitución I).
- Los eventos en tiempo real van por Socket.IO namespace `realtime` vía `RealtimeGateway.emitToUser` (Constitución V), nunca por polling.
- El patrón exclusivo de 100 se reutiliza del catálogo de patrones existentes (se marca desbloqueado), no se crea una entidad de patrón nueva; el "duerme cerca del cursor" es una flag que el escritorio anima.
- Android/iOS quedan fuera de alcance de v1 (solo escritorio consume el contrato, fase actual); las interacciones ya están resueltas en el backend, así que no requieren cliente nuevo.
- La pregunta abierta "¿items aceleran bonding?" se resuelve como **NO** en v1 (no se añade item-boost).
- El "saludo al iniciar sesión" (30+) se expone como dato en el contrato; el momento de disparar la animación lo decide la UI.