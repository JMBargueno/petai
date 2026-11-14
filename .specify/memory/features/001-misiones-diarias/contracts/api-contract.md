# API Contract: Misiones diarias/semanales

**Feature**: `001-misiones-diarias` | **Date**: 2026-11-13 | **Status**: Draft

## Convenciones

- **Base URL**: `/api/v1` (o `/` según configuración de Express).
- **Auth**: Todos los endpoints requieren `Authorization: Bearer <JWT>`.
- **Content-Type**: `application/json`.
- **Errores**: Formato estándar de `AppExceptionFilter`: `{ statusCode, message, error? }`.
- **Idioma**: Los mensajes de descripción de misiones están en español.

---

## Endpoints REST

### 1. `GET /missions`

Devuelve las misiones activas del usuario (diarias + semanales). Si no existen para el período actual, se generan on-the-fly (lazy init).

**Query params**: Ninguno (todo se extrae del JWT).

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "timestamp": "2026-11-13T14:30:00.000Z",
  "daily": [
    {
      "id": "uuid-string",
      "type": "feed",
      "description": "Alimenta a tu pet 2 veces",
      "target": 2,
      "current": 1,
      "completed": false,
      "reward": { "coins": 15, "gems": 0, "xp": 10 },
      "resetsAt": "2026-11-14T00:00:00.000Z"
    }
  ],
  "weekly": [
    {
      "id": "uuid-string",
      "type": "level_up",
      "description": "Sube 1 pet de nivel",
      "target": 1,
      "current": 0,
      "completed": false,
      "reward": { "coins": 100, "gems": 5, "xp": 100 },
      "resetsAt": "2026-11-17T00:00:00.000Z"
    }
  ],
  "dailyChestUnlocked": false
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `timestamp` | string (ISO 8601) | Fecha de la respuesta |
| `daily[]` | MissionDto[] | Misiones diarias activas (3–5) |
| `weekly[]` | MissionDto[] | Misiones semanales activas (5–7) |
| `dailyChestUnlocked` | boolean | `true` si todas las diarias están completadas |

**MissionDto**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string (UUID) | ID de la misión |
| `type` | enum: `feed`, `battle`, `minigame`, `chat`, `clean`, `sleep`, `evolve`, `hatch`, `level_up`, `battle_win`, `hatch_rare` | Tipo de acción |
| `description` | string | Texto descriptivo para la UI |
| `target` | number | Objetivo total |
| `current` | number | Progreso actual |
| `completed` | boolean | Si está completada |
| `reward.coins` | number | Monedas de recompensa |
| `reward.gems` | number | Gemas de recompensa |
| `reward.xp` | number | XP de recompensa |
| `resetsAt` | string (ISO 8601) | Fecha de reset (medianoche local / lunes local) |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `401` | Token inválido o ausente | `{ "statusCode": 401, "message": "Unauthorized" }` |
| `500` | Error interno (e.g. generación falla) | `{ "statusCode": 500, "message": "Internal server error" }` |

---

### 2. `GET /missions/summary`

Resumen de progreso y streaks.

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "dailyCompleted": 3,
  "dailyTotal": 4,
  "weeklyCompleted": 1,
  "weeklyTotal": 6,
  "streak": 5,
  "bestStreak": 12
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `dailyCompleted` | number | Misiones diarias completadas hoy |
| `dailyTotal` | number | Total de misiones diarias hoy |
| `weeklyCompleted` | number | Misiones semanales completadas esta semana |
| `weeklyTotal` | number | Total de misiones semanales esta semana |
| `streak` | number | Días consecutivos con todas las diarias completadas |
| `bestStreak` | number | Mejor streak histórico |

**Errors**: `401` (auth), `500` (interno).

---

### 3. `GET /missions/:id`

Detalle de una misión específica.

**Params**: `:id` — UUID de la misión.

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "id": "uuid-string",
  "period": "daily",
  "type": "feed",
  "description": "Alimenta a tu pet 2 veces",
  "target": 2,
  "current": 2,
  "completed": true,
  "claimed": false,
  "reward": { "coins": 15, "gems": 0, "xp": 10 },
  "periodStart": "2026-11-13T00:00:00.000Z",
  "periodEnd": "2026-11-14T00:00:00.000Z",
  "createdAt": "2026-11-13T00:00:01.000Z"
}
```

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `401` | Token inválido | `{ "statusCode": 401, "message": "Unauthorized" }` |
| `404` | Misión no existe o no pertenece al usuario | `{ "statusCode": 404, "message": "Misión no encontrada" }` |

---

### 4. `POST /missions/:id/claim`

Reclama la recompensa de una misión completada. **Atómico**: dos claims concurrentes → 1 `200`, 1 `409`.

**Params**: `:id` — UUID de la misión.

**Auth**: Bearer JWT (obligatorio).

**Success `200`**:
```json
{
  "mission": {
    "id": "uuid-string",
    "type": "feed",
    "completed": true
  },
  "reward": {
    "coins": 15,
    "gems": 0,
    "xp": 10
  },
  "dailyChestUnlocked": true
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `mission.id` | string | ID de la misión reclamada |
| `mission.type` | string | Tipo de misión |
| `mission.completed` | boolean | Siempre `true` |
| `reward` | object | Recompensa acreditada |
| `dailyChestUnlocked` | boolean | `true` si esta claim desbloqueó el cofre diario (todas las diarias completadas) |

**Errors**:
| Status | Condition | Response |
|--------|-----------|----------|
| `401` | Token inválido | `{ "statusCode": 401, "message": "Unauthorized" }` |
| `404` | Misión no existe o no es del usuario | `{ "statusCode": 404, "message": "Misión no encontrada" }` |
| `400` | Misión no está completada (`completed: false`) | `{ "statusCode": 400, "message": "La misión no está completada" }` |
| `409` | Misión ya fue reclamada (race condition) | `{ "statusCode": 409, "message": "Recompensa ya reclamada" }` |

---

## WebSocket Events (emitidos por el servidor)

Namespace: `realtime` (Socket.IO). Autenticación: JWT en handshake `auth.token`.

### `mission:progress`

Emitido cuando el progreso de una misión cambia (throttle: máx. 1 emit por 2s por misión).

**Payload**:
```json
{
  "missionId": "uuid-string",
  "current": 1,
  "target": 2
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `missionId` | string | ID de la misión que avanzó |
| `current` | number | Nuevo progreso actual |
| `target` | number | Objetivo total (para que la UI calcule %) |

**Emisor**: `MissionTrackingService.emitProgress()` → `RealtimeGateway.emitToUser(userId, 'mission:progress', payload)`

**Cuándo**: Tras cada acción de dominio que incrementa progreso (feed, battle, minigame, chat, clean, sleep, evolve, hatch, level_up). Se throttlea: si se emitió <2s para esa misión, se omite.

---

### `mission:completed`

Emitido cuando una misión alcanza `current >= target` y se marca `completed: true`.

**Payload**:
```json
{
  "missionId": "uuid-string",
  "type": "feed",
  "reward": { "coins": 15, "gems": 0, "xp": 10 },
  "dailyCompleted": 3,
  "dailyTotal": 4
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `missionId` | string | ID de la misión completada |
| `type` | string | Tipo de misión |
| `reward` | object | Recompensa a reclamar |
| `dailyCompleted` | number | Misiones diarias completadas hasta ahora |
| `dailyTotal` | number | Total de misiones diarias |

**Emisor**: `MissionTrackingService.emitMissionCompleted()`

**Cuándo**: Al completar cualquier misión (diaria o semanal).

---

### `mission:daily_complete`

Emitido cuando **todas** las misiones diarias están completadas → desbloquea el cofre diario.

**Payload**:
```json
{
  "chestUnlocked": true
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `chestUnlocked` | boolean | Siempre `true` (solo se emite al desbloquear) |

**Emisor**: `MissionTrackingService.emitMissionCompleted()` (condicional: `dailyCompleted === dailyTotal && dailyTotal > 0`)

**Cuándo**: Solo la vez que la última misión diaria se completa. No se re-emite si el usuario ya había completado todas antes.

---

## Event Subscriptions (eventos de dominio que el módulo escucha)

El módulo `missions` **escucha** los siguientes eventos de dominio emitidos por otros módulos vía `@nestjs/event-emitter`. No emite eventos de dominio; solo consume.

| Evento | Emitido por | Payload | Misión(s) afectada(s) |
|--------|-----------|---------|----------------------|
| `pet:fed` | `PetsModule` (feed) | `{ userId, petId }` | `feed` |
| `pet:cleaned` | `PetsModule` (clean) | `{ userId, petId }` | `clean` |
| `pet:slept` | `PetsModule` (sleep) | `{ userId, petId }` | `sleep` |
| `pet:evolved` | `PetsModule` (evolve) | `{ userId, petId }` | `evolve` |
| `egg:hatched` | `HatchingModule` | `{ userId, rarity? }` | `hatch` + `hatch_rare` (si rarity ≥ rare) |
| `battle:finished` | `BattlesModule` | `{ userId, won?, petId }` | `battle` + `battle_win` (si `won`) |
| `minigame:finished` | `MinigamesModule` | `{ userId, petId?, score? }` | `minigame` |
| `chat:message_sent` | `AiModule` (chat) | `{ userId, petId }` | `chat` |
| `pet:level_up` | `PetsModule` (XP) | `{ userId, petId }` | `level_up` |

**Comportamiento**: Si el usuario NO tiene una misión activa del tipo correspondiente, el evento se ignora silenciosamente (no incrementa nada). La acción principal (feed, battle, chat, etc.) se completa sin efecto en misiones.

---

## Redis Keys (transitorias)

| Key | Format | TTL | Descripción |
|-----|--------|-----|-------------|
| `missions:history:{userId}:daily` | JSON: `[{date: "2026-11-13", types: ["feed","battle"]}]` | 30 días | Últimos 3 días de tipos de misiones diarias (anti-repetición) |
| `missions:history:{userId}:weekly` | JSON: `[{date: "2026-11-10", types: ["level_up","chat"]}]` | 30 días | Últimos 7 días de tipos de misiones semanales |

**Fallback**: Si Redis no está disponible, `MissionGenerationService` consulta PostgreSQL directamente (query sobre `mission.type` con `distinct`).

---

## Resumen de errores globales

| Status | Error | Cuándo |
|--------|-------|--------|
| `401` | `Unauthorized` | Token ausente, inválido o expirado |
| `400` | `Bad Request` | Misión no completada al reclamar; parámetros inválidos |
| `404` | `Not Found` | Misión no existe o no pertenece al usuario |
| `409` | `Conflict` | Misión ya reclamada (race condition) |
| `500` | `Internal Server Error` | Fallo de DB, Redis (se usa fallback), u otro error interno |

