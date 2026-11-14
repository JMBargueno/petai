# Feature Specification: Pet Notifications con Personalidad

**Feature Branch**: `007-pet-notifications`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Reemplazar notificaciones genéricas por mensajes personalizados según personalidad, bonding tier y contexto del pet. Generados con IA (1 frase, máx 50 tokens, timeout 5s → fallback plantilla) o plantillas de `notifications.json`. Emitidos por WS `pet:notification` → desktop muestra con Tauri notification plugin. Rate limit: máx 3/día por pet. Categorías: vitals_critical, interaction, achievement, arena, event. Toggle por categoría en `PATCH /me`."

## User Scenarios & Testing *(mandatory)*

> Historias priorizadas como journeys independientes y testeables. Cada una es un MVP por sí sola: se puede desarrollar, testear, desplegar y demostrar de forma aislada.

### User Story 1 - "Mi pet me habla en su propio tono" (Priority: P1)

Como jugador, quiero que cuando mi pet necesite que lo atienda (hambre crítica, gana una pelea, completa una misión) reciba una notificación que **suene a MI pet**: un pet valiente con bonding bajo me dice "¡Oye! ¿Me dejas solo otra vez? 🙄" mientras uno tímido con bonding alto dice "Hoy no quise molestarte, pero estoy aquí. 🌸". El mensaje combina la `personality` del pet (rasgo: valiente/tímido/travieso/dulce/curioso), su `bondingTier` (acquainted → legend) y el **contexto** (vitales, victoria, logro, evento).

**Why this priority**: Es el núcleo de la feature: sin la generación personalizada del mensaje (IA o plantilla), no hay "notificación con personalidad" — solo una genérica. Todo lo demás (rate limit, dedup, toggle, UI) presupone que el mensaje ya está bien construido. Es el MVP.

**Independent Test**: Se testea sin UI: al invocar `NotificationGeneratorService.generate({ petId, userId, category, context })` con un pet de personalidad `travieso` + `bondingTier = "companion"` + `category = "vitals_critical"`, la respuesta contiene 1 frase (≤50 tokens) con tono travieso-acompañado. Si hay `AiConfig`, se verifica 1 LLM call con `max_tokens=50` y `timeout=5000`; si la IA falla, se usa la plantilla de fallback. Sin `AiConfig`, se resuelve directamente la plantilla.

**Acceptance Scenarios**:

1. **Given** un pet con `personality = { trait: "valiente" }`, `bondingTier = "acquainted"` y `hunger = 5`, **When** el sistema evalúa vitales (lazy tick detecta `hunger < criticalThreshold`), **Then** se genera un mensaje con tono valiente-nuevo (ej. "¡Oye! ¿Me dejas solo otra vez? 🙄") y se emite `pet:notification` con `{ petId, petName, type: "vitals", message, category: "vitals_critical" }`.
2. **Given** un pet con `personality = { trait: "timido" }`, `bondingTier = "soulmate"` y `hunger = 3`, **When** el sistema evalúa vitales, **Then** el mensaje es suave y respetuoso (ej. "Hoy no quise molestarte, pero estoy aquí. 🌸") — no un grito genérico.
3. **Given** un usuario con `AiConfig` activo y un pet que ganó una batalla, **When** el evento `battles` se resuelve, **Then** se hace exactamente 1 LLM call (`max_tokens=50`, `timeout=5s`); si timeout, se usa la plantilla de fallback.
4. **Given** un usuario **sin** `AiConfig` y un pet que completa una misión, **When** se emite el evento `missions`, **Then** se resuelve la plantilla de `notifications.json[personality][tier]["achievement"]` (0 LLM calls).
5. **Given** un pet con `personality = { trait: "dulce" }` y `bondingTier = "legend"`, **When** hay 4 eventos de categoría `interaction` en 3 minutos, **Then** el dispatcher aplica dedup y emite **1** única notificación (la de mayor prioridad), no 4.

---

### User Story 2 - "Que no me spamee mi pet" (Priority: P2)

Como jugador, quiero que mis notificaciones estén **limitadas y controlables**: máximo 3 push/día por pet (configurable), dedup de eventos parecidos en 5 min, y la posibilidad de **desactivar** categorías que no me interesan desde un panel de ajustes. Además, si son las 3 AM, una vitales_críticas NO me despierta (ventana de silencio respetando la zona horaria del usuario).

**Why this priority**: Sin rate limit y toggles, la feature de US1 se convierte en spam — el problema que estamos resolviendo. El dispatcher (Redis counter, dedup, prefs, quiet hours) es lo que hace que la notificación sea **deseable**. Depende de US1 para saber qué notificar, pero es testeable de forma aislada.

**Independent Test**: Se testea sin IA y sin UI: al invocar `NotificationDispatcherService.dispatch(userId, petId, category, context)` con 3 notificaciones previas el mismo día → la 4ª se descarta. 4 eventos en 3 min → solo 1 emitido (dedup). Con `notificationPrefs = { vitals_critical: false }` → ninguna de esa categoría. A las 03:00 → suprimida (quiet hours).

**Acceptance Scenarios**:

1. **Given** un usuario con 2 notificaciones emitidas hoy y `maxPerDay = 3`, **When** llega un 3er evento, **Then** se emite y el contador pasa a 3; al llegar el 4to, se descarta (contador >= 3).
2. **Given** `notificationPrefs = { vitals_critical: true, interaction: false, achievement: true, arena: true, event: true }`, **When** ocurre un evento `interaction`, **Then** no se emite ninguna notificación (toggle off).
3. **Given** un usuario en `America/Mexico_City` a las 03:00 local, **When** se dispara `vitals_critical`, **Then** no se emite (quiet hours 23:00-07:00); se registra en inbox.
4. **Given** `notificationPrefs.maxPerDay = 5`, **When** llegan 5 eventos de distinta categoría, **Then** los 5 se emiten (límite personalizado).

---

### User Story 3 - "Lo veo en mi escritorio" (Priority: P3)

Como jugador, quiero ver la notificación de mi pet **en mi escritorio**: una notificación nativa del SO (tray + popup) con el nombre de mi pet como título, el mensaje personalizado como cuerpo y su avatar. También quiero un **panel de ajustes** donde pueda togglear cada categoría y ajustar el límite diario. Si estoy offline, las notificaciones se acumulan en un inbox y las veo al reconectar.

**Why this priority**: Es la capa de entrega al usuario final. Sin ella, US1 y US2 funcionan en backend pero el jugador nunca ve la notificación. Es testeable de forma aislada: "dado un WS `pet:notification`, el desktop lo muestra". No depende de la lógica de generación/dispatcher para su validación.

**Independent Test**: Con el backend mockeando el WS event: al recibir `pet:notification` vía Socket.IO, el escritorio llama `notification.send({ title: petName, body: message, image: avatarUrl })` y aparece el popup. El `NotificationSettingsPanel` muestra toggles por categoría + slider `maxPerDay`; al cambiar un toggle, se llama `PATCH /me`. Si el usuario está offline y hay 3 notificaciones pendientes, al reconectar se muestran en inbox.

**Acceptance Scenarios**:

1. **Given** el escritorio conectado al WS, **When** el backend emite `pet:notification` con `{ petName: "Kira", message: "¡Oye! ¿Me dejas solo otra vez? 🙄", category: "vitals_critical" }`, **Then** se muestra notificación nativa: título "Kira", cuerpo "¡Oye!...", imagen = avatar.
2. **Given** el `NotificationSettingsPanel` abierto, **When** el usuario desactiva `arena`, **Then** se llama `PATCH /me` con `notificationPrefs.arena = false` y el toggle queda OFF persistido.
3. **Given** el usuario está offline y el backend emite 2 notificaciones, **When** reconecta, **Then** ambas aparecen en un inbox de notificaciones pendientes.
4. **Given** la tray icon visible, **When** hay notificaciones no leídas, **Then** la tray icon muestra un badge; al abrir la app, el badge se limpia.

---

### Edge Cases

- ¿Qué pasa si la IA genera un mensaje que no respeta el tono? → Se valida `max_tokens=50`; si excede, se truncan a 1 frase. Si timeout (5s), se usa la plantilla de fallback sin retry.
- ¿Qué pasa si el pet tiene `personality = null`? → Se usa plantilla genérica neutral (`notifications.json["neutral"][tier][category]`).
- ¿Qué pasa si 5 eventos de categorías **diferentes** llegan en 5 min? → Cada categoría tiene su propia ventana de dedup: se emite 1 por categoría (la de mayor prioridad primero si comparten el mismo rate-limit budget).
- ¿Qué pasa si el usuario borra su `AiConfig` a mitad de día? → Las notificaciones restantes usan plantilla (el dispatcher verifica `AiConfig` en cada dispatch).
- ¿Qué pasa si `maxPerDay = 0`? → Se interpreta como "desactivar todas las notificaciones" (sin excepción).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST generar un mensaje de notificación personalizado que combine `Pet.personality` (rasgo), `Pet.bondingTier` (rango) y el `context` (tipo de evento) para producir 1 frase coherente.
- **FR-002**: Si el usuario tiene `AiConfig`, el sistema MUST hacer **exactamente 1** LLM call por evento (`max_tokens=50`, `timeout=5000ms`); si falla, se usa la plantilla de fallback sin retry.
- **FR-003**: Si el usuario **no** tiene `AiConfig`, el sistema MUST resolver la plantilla de `notifications.json` directamente (0 LLM calls).
- **FR-004**: El sistema MUST aplicar rate limit de **máx 3 push/día por pet** (Redis counter, TTL 24h). Configurable vía `notificationPrefs.maxPerDay`.
- **FR-005**: El sistema MUST deduplicar notificaciones de la **misma categoría** en ventana de 5 min: emite solo la de mayor prioridad.
- **FR-006**: El sistema MUST respetar **quiet hours** (23:00–07:00 zona del usuario): durante ese rango no emite (registra en inbox).
- **FR-007**: El usuario MUST poder togglear cada categoría vía `PATCH /me` con `notificationPrefs`.
- **FR-008**: El sistema MUST emitir por WebSocket (`pet:notification` en namespace `realtime`) con payload `{ petId, petName, type, message, category }`.
- **FR-009**: El escritorio MUST consumir `pet:notification` y mostrar via Tauri notification plugin con título/body/imagen.
- **FR-010**: El escritorio MUST mantener un inbox de notificaciones pendientes cuando WS está desconectado.
- **FR-011**: El escritorio MUST exponer un `NotificationSettingsPanel` con toggles + slider.
- **FR-012**: `shared/game-data/notifications.json` MUST contener plantillas para `personality × bondingTier × category` (5+1 × 5 × 5 = 180 entradas mínimas).
- **FR-013**: La identidad (`userId`, `petId`) MUST provenir de la sesión/eventos internos; nunca de body.
- **FR-014**: El consumo de tokens de IA para notificaciones **NO** cuenta contra `AiUsage` del usuario.
- **FR-015**: La notificación MUST usar `RealtimeGateway.emitToUser` (namespace `realtime`), nunca polling.

### Key Entities *(include if feature involves data)*

- **User** (existente, ampliado): nuevo campo `notificationPrefs Json?` — `{ vitals_critical: bool, interaction: bool, achievement: bool, arena: bool, event: bool, maxPerDay: int }`. `null` = defaults (todas activas, maxPerDay=3).
- **Pet** (existente, no se modifica): se leen `personality`, `bondingTier`, `nickname` como contexto.
- **AiConfig** (existente, no se modifica): se verifica si existe para decidir IA vs plantilla.
- **Redis keys** (efímeras): `notify:count:{userId}:{YYYY-MM-DD}` (TTL 24h) y `notify:dedup:{userId}:{petId}:{category}:{windowKey}` (TTL 5 min).
- **notifications.json** (nuevo, `shared/game-data/`): plantillas por personalidad × tier × categoría.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% de las notificaciones emitidas usan el tono de la `personality` + `bondingTier` del pet (verificado por inspección manual de 50 notificaciones: 0 con tono genérico).
- **SC-002**: El LLM call tiene latencia <5s p95 (timeout duro); el fallback a plantilla se activa en <100ms tras el fallo.
- **SC-003**: El rate limit de 3/día se cumple en el 100% de los casos (test: 4 eventos → 3 emitidas, 1 descartada; sin fugas bajo concurrencia).
- **SC-004**: La dedup (5 min, misma categoría) funciona: 5 eventos en 4 min → exactamente 1 notificación emitida.
- **SC-005**: Las quiet hours (23:00-07:00) bloquean el 100% de las notificaciones dentro de ese rango.
- **SC-006**: El toggle por categoría funciona: si `vitals_critical = false`, 0 notificaciones de esa categoría en 100% de los eventos.
- **SC-007**: El escritorio muestra la notificación nativa en <1s tras recibir el WS event.
- **SC-008**: El consumo de tokens de IA por notificación es ≤50 y no incrementa `AiUsage.tokens`.

## Assumptions

- `Pet.personality` ya existe en el schema (`Json?`) con `{ trait: string }`. `BondingModule` (feature 006) ya está implementado con `bondingTier`.
- `AiConfig` y `AiModule` ya existen; se reutiliza el mecanismo de LLM call con `max_tokens=50`, `timeout=5000`.
- `RealtimeGateway.emitToUser` ya existe (namespace `realtime`); se reutiliza para `pet:notification`.
- Redis (`RedisModule` / ioredis) ya está disponible para rate limit y dedup counters.
- El escritorio Tauri ya tiene el plugin `notification` configurado (Tauri 2 `tauri-plugin-notification`).
- `shared/game-data/notifications.json` se carga vía `GameDataService` (mismo patrón que `balance.json`).
- `User.timezone` ya se almacena y se usa en `sleep-cycle.ts`; se reutiliza para quiet hours.
- Android/iOS fuera de alcance v1 (solo escritorio consume el contrato).
- 50 tokens por notificación **no** se registra en `AiUsage` (SC-008).
- `notifications.json` inicia con plantillas escritas a mano; IA puede mejorar pero no reemplaza plantillas base.
- "Chatear desde notificación" y "push mobile" quedan fuera de alcance v1.