# API Contract: Pet Notifications con Personalidad (007-pet-notifications)

**Version**: 1.0.0 | **Date**: 2026-11-13 | **Plan**: [../plan.md](../plan.md)

Este contrato define los endpoints REST, los eventos WebSocket y los puntos de integración de las notificaciones personalizadas. Se documenta con `@nestjs/swagger` en el backend; se regenera con `pnpm export:openapi` → `shared/openapi/openapi.json`.

> Todas las rutas exigen Bearer JWT (autenticación obligatoria). La identidad (`userId`) proviene **siempre** de la sesión (`@CurrentUser`); nunca se acepta `userId` en el body. Los eventos de notificación son **internos** (desparados por eventos del backend), no hay endpoint de creación.

---

## REST Endpoints

### `GET /me` (ampliado)

Devuelve el perfil del usuario autenticado, ahora incluyendo `notificationPrefs`.

**Auth**: Bearer JWT (obligatorio)

**Responses**:

| Status | Condición | Body |
|--------|-----------|------|
| `200` | OK | `MeResponse` (con `notificationPrefs`) |
| `401` | Token ausente/inválido | `UnauthorizedResponse` |

**Campo nuevo en `MeResponse`**:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "displayName": "Player",
  "timezone": "America/Mexico_City",
  "notificationPrefs": {
    "vitals_critical": true,
    "interaction": true,
    "achievement": true,
    "arena": true,
    "event": true,
    "maxPerDay": 3
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `notificationPrefs` | `NotificationPrefs \| null` | `null` = defaults (todas activas, maxPerDay=3). Si existe, objeto completo con defaults resueltos. |

**`NotificationPrefs`**:

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `vitals_critical` | boolean | `true` | Notificar cuando vitales caen por debajo del threshold |
| `interaction` | boolean | `true` | Notificar interacciones (feed, chat, minigame, clean, sleep) |
| `achievement` | boolean | `true` | Notificar logros (misiones, niveles, evoluciones) |
| `arena` | boolean | `true` | Notificar eventos de arena (victorias, derrotas) |
| `event` | boolean | `true` | Notificar eventos globales (festivales, temporada) |
| `maxPerDay` | integer (1-10) | `3` | Máximo de notificaciones/día |

---

### `PATCH /me` (ampliado)

Actualiza el perfil. Acepta `notificationPrefs` para configurar preferencias.

**Auth**: Bearer JWT (obligatorio)

**Request Body** (parcial):

```json
{
  "notificationPrefs": {
    "vitals_critical": true,
    "interaction": false,
    "maxPerDay": 5
  }
}
```

| Campo | Tipo | Required | Descripción |
|-------|------|----------|-------------|
| `notificationPrefs` | `NotificationPrefsUpdate` | No | Objeto parcial. Solo campos presentes se sobreescriben (merge). |

**`NotificationPrefsUpdate`** (todos opcionales): `vitals_critical?`, `interaction?`, `achievement?`, `arena?`, `event?` (boolean), `maxPerDay?` (1-10)

**Responses**:

| Status | Condición | Body |
|--------|-----------|------|
| `200` | OK | `MeResponse` (actualizado) |
| `400` | `maxPerDay` fuera de rango (1-10) | `BadRequestResponse` |
| `401` | Token inválido | `UnauthorizedResponse` |

**Comportamiento**: Merge parcial — si llega `{ interaction: false }`, solo cambia ese campo; el resto conserva valor anterior.

---

## WebSocket Events

### `pet:notification` (emit → usuario)

Evento emitido por el backend al usuario autenticado cuando se genera y aprueba una notificación.

**Namespace**: `realtime` (Socket.IO)

**Emit**: `RealtimeGateway.emitToUser(userId, 'pet:notification', payload)`

**Payload**:

```json
{
  "petId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "petName": "Kira",
  "type": "vitals",
  "message": "¡Oye! ¿Me dejas solo otra vez? 🙄",
  "category": "vitals_critical"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `petId` | string (uuid) | Id del pet que genera la notificación |
| `petName` | string | Nombre/nickname del pet (título de la notificación) |
| `type` | string | Tipo de evento: `vitals \| battle \| mission \| interaction \| event` |
| `message` | string | Mensaje personalizado (≤50 tokens, 1 frase) |
| `category` | string | `vitals_critical \| interaction \| achievement \| arena \| event` |

**Notas**:
- El escritorio muestra vía Tauri: `title = petName`, `body = message`, `image = avatar del pet`
- Si offline → acumular en inbox local
- El backend **no** envía avatar URL (el escritorio ya lo tiene)

---

## Internos (no expuestos al cliente)

### Eventos de dominio que disparan notificaciones

| Evento interno | Origen | Category | Type |
|---------------|--------|----------|------|
| `pet:vitals-critical` | `pets.service.ts` (lazy tick) | `vitals_critical` | `vitals` |
| `pet:interaction` | `pets.service.ts`, `ai.chat`, `minigames` | `interaction` | `interaction` |
| `pet:mission-completed` | `missions.service.ts` | `achievement` | `mission` |
| `pet:level-up` | `pets.service.ts` (XP) | `achievement` | `mission` |
| `pet:evolved` | `pets.service.ts` (evolve) | `achievement` | `mission` |
| `pet:battle-won` | `battles.service.ts` | `arena` | `battle` |
| `pet:battle-lost` | `battles.service.ts` | `arena` | `battle` |
| `event:global` | (future) eventos globales | `event` | `event` |

**Nota**: El dispatcher se suscribe vía `@OnEvent` y decide si notificar según rate limit, dedup, prefs y quiet hours.

---

## Data Files

### `shared/game-data/notifications.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": "1.0",
  "templates": {
    "valiente": {
      "acquainted": {
        "vitals_critical": ["¡Oye! ¿Me dejas solo otra vez? 🙄", "¡Estoy muriendo de hambre! 😤"],
        "interaction": ["¡Aquí estoy! ¿No me ves? 👀"],
        "achievement": ["¡Gané y ni me felicitaron! 🏆"],
        "arena": ["¡Acabo de ganar y ni te enteraste! ⚔️"],
        "event": ["¡Oye que hay evento y me dejaste! 📢"]
      },
      "companion": { "...": "..." },
      "ally": { "...": "..." },
      "soulmate": { "...": "..." },
      "legend": { "...": "..." }
    },
    "timido": { "...": "..." },
    "travieso": { "...": "..." },
    "dulce": { "...": "..." },
    "curioso": { "...": "..." },
    "neutral": { "...": "..." }
  }
}
```

**Resolución**: `templates[trait][tier][category]` → array de strings. Si `trait` no existe → `templates["neutral"][tier][category]`.

---

## Integration Points

### Backend

| Dependencia | Módulo | Uso |
|-------------|--------|-----|
| `PrismaModule` | `prisma` | `User.notificationPrefs`, `Pet.personality/bondingTier/nickname`, `AiConfig` |
| `RedisModule` | `redis` | Rate limit counter (TTL 24h), dedup key (TTL 5min) |
| `GameDataModule` | `modules/game-data` | `notifications.json`, `balance.notifications` |
| `AiModule` | `modules/ai` | LLM call (50 tokens, 5s timeout) |
| `RealtimeModule` | `modules/realtime` | Emitir `pet:notification` |
| `@nestjs/event-emitter` | global | Suscripción a eventos de dominio |
| `@nestjs/jwt` + `passport` | `auth` | Guard `@CurrentUser` |

### Desktop (Tauri)

| Consumidor | Uso |
|------------|-----|
| `notification-handler.ts` | WS listener → Tauri notification plugin |
| `notification-inbox.ts` | Inbox offline |
| `NotificationSettingsPanel.svelte` | Toggles + slider → `GET/PATCH /me` |
| Tray icon | Badge no leídas |

---

## Error Response Format

```json
{ "statusCode": 400, "message": "maxPerDay debe estar entre 1 y 10", "error": "Bad Request" }
```

| Code | Error | Mensaje |
|------|-------|---------|
| `401` | Unauthorized | "No autenticado" / "Token inválido" |
| `400` | Bad Request | "maxPerDay fuera de rango (1-10)" / "Categoría desconocida" |