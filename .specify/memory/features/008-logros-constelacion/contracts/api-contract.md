# API Contract: Logros y Constelación Visual

**Feature**: `008-logros-constelacion` | **Date**: 2026-11-13 | **Status**: Draft

## Convenciones

- **Base URL**: `/api/v1` (o `/` según configuración de Express).
- **Auth**: Todos los endpoints requieren `Authorization: Bearer <JWT>` (el perfil público se consulta con el JWT del visitante; el dueño no es necesario).
- **Content-Type**: `application/json`.
- **Errores**: Formato estándar de `AppExceptionFilter`: `{ statusCode, message, error? }`.
- **Idioma**: Los nombres y descripciones de logros están en español.
- **Categorías (`category`)**: `care` (Cuidado), `battle` (Batalla), `ai` (IA), `collection` (Colección), `social` (Social).
- **Tiers (`tier`)**: `common`, `rare`, `epic`, `legendary`.
- **Estado (`status`)**: `locked` (`current === 0`), `in_progress` (`0 < current < target`), `unlocked` (`current >= target`).

---

## Endpoints REST

### 1. `GET /achievements`

Devuelve todos los logros del usuario con su estado.

**Query params**: Ninguno (todo se extrae del JWT).

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "timestamp": "2026-11-13T14:30:00.000Z",
  "achievementsPublic": false,
  "categories": {
    "care": [
      {
        "id": "care_feed_50",
        "category": "care",
        "name": "Alimentación constante",
        "description": "Alimenta a tu pet 50 veces",
        "tier": "common",
        "target": 50,
        "current": 12,
        "status": "in_progress",
        "unlockedAt": null,
        "claimed": false,
        "reward": { "coins": 100, "gems": 0, "xp": 40, "itemId": null }
      }
    ],
    "battle": [
      {
        "id": "battle_10_wins",
        "category": "battle",
        "name": "Guerrero",
        "description": "Gana 10 peleas",
        "tier": "rare",
        "target": 10,
        "current": 10,
        "status": "unlocked",
        "unlockedAt": "2026-11-10T09:15:00.000Z",
        "claimed": true,
        "reward": { "coins": 250, "gems": 2, "xp": 100, "itemId": null }
      }
    ],
    "ai": [],
    "collection": [],
    "social": []
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | Fecha de la respuesta |
| `achievementsPublic` | boolean | Estado del opt-in de visibilidad pública |
| `categories.<cat>[]` | AchievementDto[] | Logros por categoría (10-15 c/u) |

**AchievementDto**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID lógico del logro (p. ej. `battle_10_wins`) |
| `category` | enum: `care`, `battle`, `ai`, `collection`, `social` | Categoría/constelación |
| `name` | string | Nombre corto para la UI |
| `description` | string | Texto descriptivo |
| `tier` | enum: `common`, `rare`, `epic`, `legendary` | Tier del logro |
| `target` | number | Objetivo total |
| `current` | number | Progreso actual |
| `status` | enum: `locked`, `in_progress`, `unlocked` | Estado derivado |
| `unlockedAt` | string (ISO 8601) / null | Fecha de desbloqueo |
| `claimed` | boolean | Si la recompensa fue reclamada |
| `reward.coins` | number | Monedas de recompensa |
| `reward.gems` | number | Gemas de recompensa |
| `reward.xp` | number | XP de recompensa |
| `reward.itemId` | string / null | Item exclusivo (solo `epic`/`legendary`) |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `401` | Token inválido o ausente | `{ "statusCode": 401, "message": "Unauthorized" }` |
| `500` | Error interno (e.g. game-data no cargado) | `{ "statusCode": 500, "message": "Internal server error" }` |

---

### 2. `GET /achievements/constellation/{cat}`

Devuelve el layout de la constelación de una categoría con posiciones, estado y líneas de conexión para el SVG.

**Path params**: `cat` — una de `care | battle | ai | collection | social`.

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "category": "battle",
  "name": "Batalla",
  "stars": [
    { "id": "battle_1_wins",  "x": 0.12, "y": 0.80, "status": "unlocked",    "name": "Primera victoria", "tier": "common" },
    { "id": "battle_10_wins", "x": 0.35, "y": 0.62, "status": "unlocked",    "name": "Guerrero",         "tier": "rare" },
    { "id": "battle_50_wins", "x": 0.60, "y": 0.40, "status": "in_progress", "name": "Veterano",         "tier": "epic" },
    { "id": "battle_200_wins","x": 0.85, "y": 0.15, "status": "locked",      "name": "Leyenda",          "tier": "legendary" }
  ],
  "connections": [
    ["battle_1_wins", "battle_10_wins"],
    ["battle_10_wins", "battle_50_wins"],
    ["battle_50_wins", "battle_200_wins"]
  ],
  "progress": { "unlocked": 2, "total": 4 }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `category` | string | Categoría solicitada |
| `name` | string | Nombre visible de la constelación |
| `stars[]` | StarDto[] | Estrellas con coordenadas normalizadas [0,1] y estado |
| `connections[][]` | string[2][] | Pares de `id` de estrellas a unir con línea |
| `progress.unlocked` | number | Estrellas desbloqueadas |
| `progress.total` | number | Total de estrellas de la categoría |

**StarDto**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID del logro/estrella |
| `x` | number (0-1) | Coordenada X normalizada |
| `y` | number (0-1) | Coordenada Y normalizada |
| `status` | enum: `locked`, `in_progress`, `unlocked` | Estado de la estrella |
| `name` | string | Nombre del logro |
| `tier` | enum: `common`, `rare`, `epic`, `legendary` | Tier del logro |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `400` | `cat` no es una categoría válida | `{ "statusCode": 400, "message": "Categoría desconocida" }` |
| `401` | Token inválido o ausente | `{ "statusCode": 401, "message": "Unauthorized" }` |
| `500` | Error interno | `{ "statusCode": 500, "message": "Internal server error" }` |

---

### 3. `POST /achievements/:id/claim`

Reclama la recompensa de un logro desbloqueado (idempotente; el reward se otorga automáticamente al desbloquear, el claim expone/marca el estado).

**Path params**: `id` — ID lógico del logro.

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "id": "battle_10_wins",
  "name": "Guerrero",
  "claimed": true,
  "reward": { "coins": 250, "gems": 2, "xp": 100, "itemId": null },
  "balance": { "coins": 1250, "gems": 7, "accountXp": 540 }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID del logro |
| `name` | string | Nombre del logro |
| `claimed` | boolean | Estado tras el reclamo |
| `reward` | object | Recompensa reclamada |
| `balance` | object | Saldo del usuario tras el reclamo |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `400` | Logro no desbloqueado | `{ "statusCode": 400, "message": "Logro no desbloqueado" }` |
| `404` | Logro no existe o no es del usuario | `{ "statusCode": 404, "message": "Logro no encontrado" }` |
| `409` | Ya reclamado (race) | `{ "statusCode": 409, "message": "Logro ya reclamado" }` |
| `401` | Token inválido o ausente | `{ "statusCode": 401, "message": "Unauthorized" }` |

---

### 4. `GET /users/:id/achievements?public=true`

Perfil público de logros de otro usuario. Solo expone los logros `unlocked` si el dueño activó `achievementsPublic`; NUNCA expone el progreso (`current`) de los no desbloqueados.

**Path params**: `id` — ID del usuario cuyo perfil se consulta.

**Query params**: `public` (opcional, `true` por defecto cuando el endpoint se usa para perfil público).

**Auth**: Bearer JWT del visitante (obligatorio).

**Success `200` (dueño con `achievementsPublic: true`)**:
```json
{
  "userId": "uuid-string",
  "displayName": "Alma",
  "achievementsPublic": true,
  "totalUnlocked": 12,
  "byCategory": {
    "care": { "unlocked": 3, "total": 12 },
    "battle": { "unlocked": 5, "total": 12 }
  },
  "stars": [
    { "id": "battle_10_wins", "category": "battle", "name": "Guerrero", "tier": "rare" },
    { "id": "care_feed_50", "category": "care", "name": "Alimentación constante", "tier": "common" }
  ]
}
```

**Success `200` (dueño con `achievementsPublic: false`)**:
```json
{
  "userId": "uuid-string",
  "displayName": "Alma",
  "achievementsPublic": false,
  "totalUnlocked": 0,
  "byCategory": {},
  "stars": []
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `userId` | string | ID del usuario |
| `displayName` | string | Nombre visible del dueño |
| `achievementsPublic` | boolean | Si el dueño activó la visibilidad |
| `totalUnlocked` | number | Logros desbloqueados visibles |
| `byCategory.<cat>` | `{ unlocked, total }` | Resumen por categoría |
| `stars[]` | object | Solo logros `unlocked` (`id`, `category`, `name`, `tier`); **sin** `current` |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `404` | Usuario no existe | `{ "statusCode": 404, "message": "Usuario no encontrado" }` |
| `401` | Token inválido o ausente | `{ "statusCode": 401, "message": "Unauthorized" }` |

> **Privacidad**: si `achievementsPublic: false`, `stars` y `byCategory` quedan vacíos (SC-006). El progreso interno nunca se serializa en esta respuesta.

---

### 5. `PATCH /me` (campo `achievementsPublic`)

Activa/desactiva la visibilidad pública de los logros del usuario autenticado. (Extiende el `PATCH /me` existente de `UsersModule`.)

**Body**:
```json
{ "achievementsPublic": true }
```

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "userId": "uuid-string",
  "achievementsPublic": true
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `userId` | string | ID del usuario actualizado |
| `achievementsPublic` | boolean | Nuevo estado de visibilidad |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `400` | `achievementsPublic` no es booleano | `{ "statusCode": 400, "message": "Bad Request" }` |
| `401` | Token inválido o ausente | `{ "statusCode": 401, "message": "Unauthorized" }` |

---

## Eventos WebSocket (namespace `realtime`)

### `achievement:unlocked`

Emitido cuando el usuario desbloquea un logro → anima la estrella y muestra el reward.

**Payload**:
```json
{
  "id": "battle_10_wins",
  "name": "Guerrero",
  "category": "battle",
  "tier": "rare",
  "reward": { "coins": 250, "gems": 2, "xp": 100, "itemId": null }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID del logro desbloqueado |
| `name` | string | Nombre del logro |
| `category` | string | Categoría/constelación |
| `tier` | string | Tier del logro |
| `reward` | object | Recompensa otorgada (incluye `itemId` si aplica) |

**Emisor**: `AchievementTrackingService` / `AchievementRewardsService` vía `RealtimeGateway.emitToUser(userId, 'achievement:unlocked', payload)`.

**Cuándo**: Solo la primera vez que un logro alcanza `target` (idempotente; no se re-emite si ya estaba desbloqueado).

---

## Event Subscriptions (eventos de dominio que el módulo escucha)

El módulo `achievements` **escucha** los siguientes eventos de dominio emitidos por otros módulos vía `@nestjs/event-emitter` (mismo set que `MissionTrackingService`). No emite eventos de dominio; solo consume para actualizar el progreso.

| Evento | Emitido por | Payload | Logros afectados (por `event`) |
|--------|-----------|---------|--------------------------------|
| `pet:fed` | `PetsModule` (feed) | `{ userId, petId }` | logros de Cuidado con `event: "pet:fed"` |
| `pet:cleaned` | `PetsModule` (clean) | `{ userId, petId }` | logros de Cuidado `event: "pet:cleaned"` |
| `pet:slept` | `PetsModule` (sleep) | `{ userId, petId }` | logros de Cuidado `event: "pet:slept"` |
| `pet:evolved` | `PetsModule` (evolve) | `{ userId, petId }` | logros de Colección `event: "pet:evolved"` |
| `pet:level_up` | `PetsModule` (XP) | `{ userId, petId }` | logros de Cuidado/Colección `event: "pet:level_up"` |
| `egg:hatched` | `HatchingModule` | `{ userId, rarity? }` | logros de Colección `event: "egg:hatched"` (incl. condicionados a rareza) |
| `battle:finished` | `BattlesModule` | `{ userId, won?, petId }` | logros de Batalla `event: "battle:finished"` y/o `event: "battle_win"` (si `won`) |
| `minigame:finished` | `MinigamesModule` | `{ userId, petId?, score? }` | logros `event: "minigame:finished"` |
| `chat:message_sent` | `AiModule` (chat) | `{ userId, petId }` | logros de IA `event: "chat:message_sent"` |
| `social:constellation_shared` | `AchievementsModule` (export) | `{ userId }` | logros de Social `event: "social:constellation_shared"` (opcional, ver pregunta abierta #4) |

**Comportamiento**: Si el usuario NO tiene un logro activo (no desbloqueado) con ese `event`, el evento se ignora silenciosamente (no incrementa nada). La acción principal (feed, battle, chat, etc.) se completa sin efecto en logros.

---

## Redis Keys (transitorias)

| Key | Format | TTL | Descripción |
|-----|--------|-----|-------------|
| `ach:progress:{userId}:{achId}` | number (contador en caliente) | ~30s (flush) | Progreso en caliente de un logro antes de persistir en PG |

**Flush**: ~30s en lote a PostgreSQL (`updateMany`).
**Fallback**: Si Redis no está disponible, `AchievementTrackingService` opera directamente sobre PostgreSQL (Redis es acelerante, no requisito — Constitución).

---

## Resumen de errores globales

| Status | Error | Cuándo |
|--------|-------|--------|
| `401` | `Unauthorized` | Token ausente, inválido o expirado |
| `400` | `Bad Request` | Logro no desbloqueado al reclamar; `cat` inválido en constelación; `achievementsPublic` inválido |
| `404` | `Not Found` | Logro/usuario no existe o no pertenece al dueño |
| `409` | `Conflict` | Logro ya reclamado (race condition) |
| `500` | `Internal Server Error` | Fallo de DB, Redis (se usa fallback), game-data no cargado u otro error interno |