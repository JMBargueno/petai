# Feature Specification: Environmental Awareness & Mood Weather

**Feature Branch**: `005-environmental-awareness`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Sistema que hace que el pet reaccione al contexto del usuario: hora del día (timezone), clima real (API meteo), actividad del PC (inactividad) y festividades. Genera micro-momentos que rompen la cuarta pared: paraguas si llueve, bostezo a las 3 AM, '¿Descansas?' si no lo visitas en 2h, sombrerito en Navidad, y el clima modifica los vitales del pet. Conecta `User.timezone`, vitals del `Pet`, animaciones del escritorio y el prompt de IA."

## User Scenarios & Testing *(mandatory)*

> Historias priorizadas como journeys independientes y testeables. Cada una es un MVP por sí sola: se puede desarrollar, testear, desplegar y demostrar de forma aislada.

### User Story 1 - "El pet siente el mundo": hora del día + clima real (Priority: P1)

Como jugador, quiero que mi pet "sienta" que es madrugada o tarde, y que note el clima real de mi ciudad (llueve, hace calor, nieve), para que reaccione de forma orgánica al entorno donde "vive" y, además, para que el clima incida en sus necesidades (con calor le da más hambre, con lluvia sube su ánimo, con nieve gasta energía).

**Why this priority**: Es la premisa central de toda la feature ("El pet vive en mi mundo"). Sin el estado ambiental (hora + clima) ni sus efectos sobre los vitales no existe la feature: las demás historias (inactividad, festividades, expresión) se apoyan sobre este estado. Es el MVP.

**Independent Test**: Se testea por completo sin depender de la UI: con un `GET /environmental/status` (token válido) se verifica la forma `{ timeOfDay, weather, activity, festival }`; con coordenadas configuradas y un mock de Open-Meteo se verifica el cache de Redis (segunda llamada en 30 min sin nuevo upstream) y el fallback (API caída → último cacheado o `unknown`); y simulando un lazy tick de 3 horas con `weather=hot` se verifica que `hunger` decae el extra de `hunger_hot`.

**Acceptance Scenarios**:

1. **Given** un usuario con `timezone = America/Mexico_City`, coordenadas guardadas y un mock de Open-Meteo devolviendo `temperature_2m = 32`, **When** llama a `GET /environmental/status`, **Then** la respuesta incluye `weather.condition = "hot"` (según `hot_temp = 30` de `balance.environmental`) y `timeOfDay` correcto para su zona (p. ej. `afternoon` a las 15:00).
2. **Given** el usuario tiene coordenadas guardadas y la primera llamada ya cacheó `weather:{lat}:{lon}` con TTL de 30 min, **When** vuelve a llamar a `GET /environmental/status` dentro de esa ventana, **Then** el clima se sirve desde Redis y **no** se dispara una segunda llamada a Open-Meteo.
3. **Given** Open-Meteo responde con error o timeout (p. ej. 3 s), **When** llama a `GET /environmental/status`, **Then** el sistema devuelve el último valor cacheado si existe, o `weather.condition = "unknown"` en su defecto, y **nunca** responde `5xx`.
4. **Given** un pet cuyo `lastTickAt` es 3 horas atrás y el estado ambiental es `weather = "hot"`, **When** cualquier lectura del pet dispara `applyLazyTick`, **Then** además del decaimiento base se aplica el modificador `hunger_hot` (±0.5/h) sobre `hunger`, acotado a [0, max].
5. **Given** el usuario NO tiene coordenadas guardadas (opt-in desactivado), **When** llama a `GET /environmental/status`, **Then** `weather.condition = "unknown"` y, aun así, se devuelve `timeOfDay`, `activity` y `festival` correctamente (degradación elegante).

---
### User Story 2 - "El pet se aburre si no lo visitas": inactividad → modo solo (Priority: P2)

Como jugador, quiero que mi pet detecte que he dejado el PC inactivo y entre en un modo "solo" (juega por su cuenta, muestra un accesorio/animación de aburrimiento y me saluda "¿Descansas?") para que se sienta vivo incluso cuando no interactúo con él.

**Why this priority**: Tiene dependencias distintas a las de US1 (heartbeat del escritorio + tracker de actividad en Redis), entrega valor por sí sola y es testeable en aislamiento. Es la segunda capa de "vida" del pet.

**Independent Test**: Sin clima ni festividades: el escritorio (o un test) dispara `POST /environmental/activity` con `{ active: true }`; al dejar de disparar heartbeats, tras el umbral (`inactivityThresholdHours = 2`) un `GET /environmental/status` debe responder `activity.mode = "solo"`; al reenviar un heartbeat, debe volver a `"active"`.

**Acceptance Scenarios**:

1. **Given** el escritorio acaba de enviar un heartbeat (`POST /environmental/activity` → `{ ok: true }`), **When** llama a `GET /environmental/status`, **Then** `activity.active = true` y `activity.mode = "active"`.
2. **Given** no hay ningún heartbeat desde hace más de 2 horas (umbral), **When** llama a `GET /environmental/status`, **Then** `activity.active = false` y `activity.mode = "solo"`.
3. **Given** el pet estaba en modo `"solo"` y el usuario regresa (nuevo heartbeat), **When** se procesa el heartbeat, **Then** el estado vuelve a `"active"` y se emite el evento WebSocket `environmental:changed` para que el escritorio muestre el micro-momento de "despertar".
4. **Given** el cuerpo del heartbeat es `{ active: false }` o `cpuUsage` inválido, **When** se procesa la petición, **Then** el sistema valida y normaliza el input (no falla, no guarda basura) y responde `{ ok: true }` con el estado coherente.

---

### User Story 3 - "El pet celebra y expresa su mundo": festividades + expresión + IA (Priority: P3)

Como jugador, quiero que mi pet lleve un accesorio en festividades (sombrerito en Navidad), que me diga una frase especial, que consulte las festividades próximas, y que su conversación con la IA sepa el contexto ambiental (hora, clima, festividad) para que "hable" de su mundo; todo reflejado en el overlay de animaciones del escritorio.

**Why this priority**: Capa de "delight"/expresión que se apoya sobre el estado ya resuelto por US1/US2. Añade valor de enganche y de coherencia narrativa, pero es el último slice porque depende del contrato de estado estable.

**Independent Test**: Sembrando `festivals.json` con una festividad de hoy en la región del usuario, un `GET /environmental/status` debe devolver `festival = { id, name, accessory, message }` y `GET /environmental/festivals/upcoming` debe listarla con `daysRemaining`. Al chatear, el prompt de sistema del pet debe incluir el bloque de contexto ambiental. El overlay del escritorio puede dibujar el accesorio a partir del estado ya devuelto.

**Acceptance Scenarios**:

1. **Given** `festivals.json` contiene una festividad cuya fecha coincide con hoy (región del usuario o global), **When** llama a `GET /environmental/status`, **Then** `festival = { id, name, accessory, message }` y el overlay del escritorio renderiza el accesorio correspondiente.
2. **Given** no hay festividad activa hoy, **When** llama a `GET /environmental/status`, **Then** `festival = null`.
3. **Given** hay una festividad a 3 días, **When** llama a `GET /environmental/festivals/upcoming`, **Then** la respuesta incluye esa entrada con `daysRemaining = 3`.
4. **Given** el estado ambiental es `{ timeOfDay: "late_night", weather: "rain", festival: null }`, **When** el usuario envía un mensaje de chat, **Then** el prompt de sistema del pet incluye un bloque de contexto con esos valores (verificable en el string de prompt en tests de unidad).

---

### Edge Cases

- **¿Sin coordenadas y API de meteo apagada?** El `status` sigue devolviendo `timeOfDay`, `activity` y `festival`; `weather.condition = "unknown"`. El lazy tick no aplica ningún modificador de clima.
- **¿Cambio de horario (DST)?** `timeOfDay` se calcula con la zona IANA (`safeTimeZone`) del usuario, de modo que la hora local sea correcta el día del salto horario.
- **¿Coordenadas que cambian a mitad de sesión?** La clave de cache se redondea (p. ej. 2 decimales); si cambian, se usa una clave nueva y la vieja expira sola por TTL.
- **¿Varios dispositivos enviando heartbeats?** El heartbeat es idempotente: solo importa el `lastActiveAt` más reciente por usuario.
- **¿Festividad multi-día o en el borde de medianoche?** El lookup de festividad maneja rango de fechas (`monthStart/dayStart` → `monthEnd/dayEnd`) y compara en la zona local del usuario, no en UTC.
- **¿`POST /environmental/activity` abusivo?** El endpoint aplica el rate limiting existente por usuario/IP.
- **¿Weather API devuelve un `weather_code` WMO desconocido?** El mapeo tiene un default a `clear`/`unknown` y nunca lanza.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST calcular `timeOfDay` (`night | morning | afternoon | evening | late_night`) a partir de la `timezone` guardada del usuario (`User.timezone`), no del servidor.
- **FR-002**: El sistema MUST obtener el clima actual desde Open-Meteo usando las coordenadas del usuario (`latitude`, `longitude`).
- **FR-003**: El sistema MUST cachear el clima en Redis con clave `weather:{lat}:{lon}` y TTL de 30 minutos, sirviendo desde cache las llamadas repetidas dentro de la ventana.
- **FR-004**: El sistema MUST degradar a `unknown` (o al último valor cacheado) cuando la API de meteo falle o exceda el timeout, sin devolver un error al cliente.
- **FR-005**: El sistema MUST exponer `GET /environmental/status` que retorna `{ timeOfDay, weather, activity, festival }`.
- **FR-006**: El sistema MUST tratar las coordenadas como **opt-in de privacidad**: si el usuario no las ha proporcionado, `weather.condition` es `unknown` y el resto del estado se sirve igualmente.
- **FR-007**: El sistema MUST aplicar los modificadores de vitales ambientales definidos en `balance.json → environmental` dentro del **lazy tick** (`applyLazyTick`): calor → extra de decaimiento de `hunger`, lluvia → modificador de `happiness`, nieve → modificador de `energy`, todo acotado a [0, max].
- **FR-008**: El sistema MUST aceptar un heartbeat de escritorio vía `POST /environmental/activity` con body `{ active, cpuUsage? }` y almacenar la última actividad por usuario en Redis (`activity:{userId}`, TTL 3h).
- **FR-009**: El sistema MUST clasificar la actividad: si han transcurrido más de `inactivityThresholdHours` (2h) desde el último heartbeat, `activity.mode = "solo"`; en caso contrario `"active"`.
- **FR-010**: El sistema MUST buscar la festividad activa en `festivals.json` (por fecha + región) y adjuntar `accessory` + `message`.
- **FR-011**: El sistema MUST exponer `GET /environmental/festivals/upcoming` que devuelve las festividades próximas con `daysRemaining`.
- **FR-012**: El sistema MUST inyectar el contexto ambiental `{ timeOfDay, weather, festival }` en el prompt de sistema del pet (IA).
- **FR-013**: El sistema MUST emitir el evento WebSocket `environmental:changed` cuando cambia una condición relevante (cambio de `timeOfDay`, de clima, a modo solo / de solo a activo, inicio/fin de festividad).
- **FR-014**: El sistema MUST añadir `latitude Float?`, `longitude Float?` y `birthday String?` (MM-DD) al modelo `User` mediante una migración Prisma.
- **FR-015**: El sistema MUST leer todos los números ajustables (umbrales de temperatura, tasas de modificadores, umbral de inactividad) desde `balance.json → environmental`, **nunca** hardcodeados.
- **FR-016**: El sistema MUST resolver `userId` siempre desde la sesión (JWT / `@CurrentUser`), jamás de un parámetro enviado por el cliente o por el modelo de IA.
- **FR-017**: El sistema MUST mantener la lógica de mapeo de clima y de `timeOfDay` como funciones puras (sin dependencias de Nest) para poder testearlas de forma unitaria e aislada.
- **FR-018**: El sistema MUST registrar el nuevo módulo `environmental` en `AppModule` y seguir la convención de módulos por dominio (controller + services inyectando `PrismaService`, `RedisService`, `GameDataService`, `RealtimeGateway`).
- **FR-019**: El sistema MUST proteger contra SSRF el fetch de meteo (allowlist de host `open-meteo.com`, solo `http/https`).
- **FR-020**: El sistema MUST [NEEDS CLARIFICATION: definir la granularidad de **región** para filtrar festividades — ¿se deriva de la `timezone`, de un campo `region` en `User`, o en v1 se usa una lista global única y el filtrado por región se pospone?].

*Resuelto según las "Preguntas abiertas" del spec fuente:* Provider de meteo = **Open-Meteo** (gratis, sin API key, privacy-friendly); modificadores moderados (±0.5/h máx.).

### Key Entities *(include if feature involves data)*

- **User** (modificación existente): Se añaden `latitude Float?`, `longitude Float?` (opt-in de privacidad) y `birthday String?` (formato `MM-DD`, opcional para festividades de cumpleaños). Ya posee `timezone` (clave para `timeOfDay` y zona local de festividades).
- **Estado ambiental (efímero, sin modelo Prisma nuevo)**: Vive en Redis.
  - `weather:{lat}:{lon}` → JSON `{ temperature, weatherCode, condition, fetchedAt }`, TTL 30 min. `lat/lon` redondeadas a 2 decimales para la clave.
  - `activity:{userId}` → JSON `{ lastActiveAt, active, cpuUsage? }`, TTL 3 h.
- **festivals.json** (nuevo, `shared/game-data`): `[{ id, name, monthStart, dayStart, monthEnd?, dayEnd?, region?, accessory, message }]`. Se carga vía `GameDataService`.
- **balance.json → environmental** (sección nueva, `shared/game-data`): `{ hot_temp: 30, cold_temp: 5, hunger_hot: 0.5, happiness_rain: 0.5, energy_snow: 0.5, inactivityThresholdHours: 2 }`. Se consume vía `gameData.getBalance().environmental`.
- **Pet (consumo, sin cambio de esquema)**: Sus vitales (`hunger`, `happiness`, `energy`) reciben los modificadores ambientales dentro de `applyLazyTick`; no se altera el esquema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95% de las llamadas a `GET /environmental/status` responde en < 500 ms con la cache de Redis caliente.
- **SC-002**: El 100% de las peticiones repetidas de clima dentro de la ventana de 30 min se sirven desde Redis (cero llamadas upstream duplicadas en la prueba de carga).
- **SC-003**: El 100% de los fallos de la API de meteo degradan a último cacheado o `unknown` sin devolver una respuesta de error al cliente.
- **SC-004**: `timeOfDay` es correcto para el 100% de las zonas horarias probadas, incluidas las transiciones de cambio horario (DST).
- **SC-005**: La detección de inactividad transita a modo `"solo"` dentro de un ciclo de polling de superado el umbral de 2 h, y de vuelta a `"active"` dentro de un heartbeat tras el regreso del usuario.
- **SC-006**: En una simulación de lazy tick de 3 horas con `weather = "hot"`, el cambio de vitales coincide con ±0.5/h (dentro del redondeo a 2 decimales) definido por `balance.environmental`.
- **SC-007**: El 100% de los prompts de sistema del pet con estado ambiental presente incluyen el bloque de contexto `{ timeOfDay, weather, festival }`.
- **SC-008**: El lookup de festividades devuelve el accesorio/frase correcta para la fecha+región actual en el 100% de los casos sembrados, y `null` cuando no hay festividad activa.

## Assumptions

- Se reutilizan los sistemas existentes: autenticación (JWT / `@CurrentUser`), `User.timezone`, `RealtimeGateway.emitToUser`, `RedisService`, `GameDataService` y `applyLazyTick` de `pets.service.ts`.
- El provider de meteo es **Open-Meteo** (gratis, sin API key): `GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code,is_day`. Se mapea `weather_code` (WMO) + `temperature_2m` a `condition` (`rain | snow | hot | cold | clear | cloud | unknown`) según `balance.environmental`.
- El estado ambiental es **por usuario** (no por pet): todos los pets de un usuario comparten el mismo clima, hora y festividad. El endpoint `GET /environmental/status` es a nivel de usuario.
- Las coordenadas provienen de la geolocalización del escritorio (opt-in, privacidad) y se guardan redondeadas; el servidor solo las usa para consultar el clima y como clave de cache.
- Los modificadores de vitales son moderados (±0.5/h) y **solo** se aplican dentro del lazy tick (no hay un cron por usuario/pet), conforme al principio IV (Lazy Tick) de la Constitución.
- El filtrado de festividades por **región** se deja como `NEEDS CLARIFICATION` (FR-020); en v1 se contempla una lista global + `region` opcional.
- Esta spec cubre el **backend y el contrato** (API REST + WebSocket + datos de juego); el escritorio (Tauri/Svelte) consume esos contratos vía tipos generados de `openapi.json` + Socket.IO. El overlay, el heartbeat y las animaciones del escritorio son el consumidor, no una segunda fuente de verdad.
- La limpieza de claves de actividad caducadas se resuelve con el **TTL de Redis (3h)**, sin una cola BullMQ nueva (principio IX, YAGNI); el job `environmental:heartbeat-cleanup` del spec fuente es opcional y se omite si el TTL ya resuelve el caso.

