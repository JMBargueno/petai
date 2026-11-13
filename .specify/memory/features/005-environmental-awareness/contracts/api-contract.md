# API Contract: Environmental Awareness & Mood Weather

**Feature**: 005-environmental-awareness | **Status**: Draft
**Autor**: Backend NestJS (autoritativo) | **Consumo**: escritorio Tauri (y futuros Android/iOS)

> Este contrato se documenta con `@nestjs/swagger` y se publica en `shared/openapi/openapi.json`.
> Los clientes usan los **tipos generados** (`openapi-fetch`), no tipos reescritos a mano (Constitución III).
> Todos los endpoints requieren `Authorization: Bearer <access_token>` salvo indicación. La identidad
> (`userId`) proviene del JWT; **nunca** de un parámetro de body/query (Constitución I).

## Tipos comunes

### `TimeOfDay`
`"night" | "morning" | "afternoon" | "evening" | "late_night"`

### `WeatherCondition`
`"clear" | "cloud" | "rain" | "snow" | "hot" | "cold" | "unknown"`

### `ActivityMode`
`"active" | "solo"`

### `WeatherInfo`
```jsonc
{
  "condition": "hot",        // WeatherCondition
  "temperature": 32,          // number | null  (°C actual)
  "weatherCode": 0,           // number | null  (código WMO de Open-Meteo)
  "cached": true,             // bool: servido desde cache Redis
  "fetchedAt": "2026-11-13T15:00:00.000Z"  // string ISO 8601 | null
}
```

### `ActivityInfo`
```jsonc
{
  "active": true,            // bool: ¿hay heartbeat reciente?
  "mode": "active",          // ActivityMode
  "lastActiveAt": "2026-11-13T15:00:00.000Z"  // string ISO 8601 | null
}
```

### `FestivalInfo`
```jsonc
{
  "id": "navidad",
  "name": "Navidad",
  "accessory": "sombrerito",   // clave de accesorio/overlay para el escritorio
  "message": "¡Feliz Navidad! 🎄"
}
```

### `EnvironmentalStatus` (respuesta de `/status`)
```jsonc
{
  "timeOfDay": "afternoon",      // TimeOfDay
  "weather": { "condition": "hot", "temperature": 32, "weatherCode": 0, "cached": true, "fetchedAt": "..." },
  "activity": { "active": true, "mode": "active", "lastActiveAt": "..." },
  "festival": null                // FestivalInfo | null
}
```
## Endpoints REST

### `GET /environmental/status`

Devuelve el estado ambiental compuesto del usuario (hora del día, clima, actividad, festividad).

- **Auth**: Bearer (JWT de acceso).
- **Query / Body**: ninguno (todo se deriva de la sesión).
- **200 OK** → `EnvironmentalStatus` (ver arriba).
- **401 Unauthorized** → token ausente/inválido/caducado.
- **Semántica de degradación**: si no hay coordenadas o la API de meteo falla, `weather.condition = "unknown"` y el resto (`timeOfDay`, `activity`, `festival`) se devuelve igualmente. **Nunca** devuelve `5xx` por fallo del provider de meteo (FR-004).
- **Caché**: si `User.latitude/longitude` existen y `weather:{lat}:{lon}` está en Redis (< 30 min), `weather.cached = true` y no se consulta Open-Meteo.

Ejemplo de respuesta:
```json
{
  "timeOfDay": "afternoon",
  "weather": { "condition": "hot", "temperature": 32, "weatherCode": 0, "cached": true, "fetchedAt": "2026-11-13T15:00:00.000Z" },
  "activity": { "active": true, "mode": "active", "lastActiveAt": "2026-11-13T15:00:10.000Z" },
  "festival": null
}
```

### `POST /environmental/activity`

Heartbeat del escritorio para detectar actividad/inactividad del PC.

- **Auth**: Bearer (JWT de acceso).
- **Body** (`ActivityHeartbeatDto`):
```jsonc
{
  "active": true,     // bool (default true)
  "cpuUsage": 42.5     // number | null (opcional, opcional en v1)
}
```
- **Validación**: `active` debe ser booleano; `cpuUsage` si se pasa debe ser `number` ≥ 0; si no, se ignora (no se guarda basura, FR / edge-case).
- **200 OK** → `{ "ok": true }`.
- **401 Unauthorized** → token inválido.
- **Rate limit**: aplica el límite global por usuario/IP (Constitución VIII).
- **Efecto**: actualiza `activity:{userId}` con `lastActiveAt = now` (TTL 3 h). Al transitar de `"solo"` a `"active"` se emite `environmental:changed` (ver abajo).

### `GET /environmental/festivals/upcoming`

Lista las festividades próximas (incluida la activa de hoy).

- **Auth**: Bearer (JWT de acceso).
- **200 OK** → `UpcomingFestival[]`:
```jsonc
[
  { "id": "navidad", "name": "Navidad", "date": "2026-12-25", "daysRemaining": 42 },
  { "id": "cumpleaños", "name": "Tu cumpleaños", "date": "2027-03-02", "daysRemaining": 109 }
]
```
- `daysRemaining` es ≥ 0; la festividad de hoy tiene `daysRemaining = 0`.
- **401 Unauthorized** → token inválido.

## WebSocket (namespace `realtime`)

### `environmental:changed`

- **Dirección**: sala `user:<userId>` vía `RealtimeGateway.emitToUser(userId, "environmental:changed", payload)`.
- **Payload** (`EnvironmentalChangedEvent`):
```jsonc
{
  "type": "weather" | "timeOfDay" | "activity" | "festival",
  "data": {
    // contenido según `type`:
    // weather:    { condition, temperature, weatherCode }
    // timeOfDay:  { timeOfDay }
    // activity:   { mode }                 // "solo" | "active"
    // festival:   FestivalInfo | null
  }
}
```
- **Cuándo se emite**: cambio de `timeOfDay`, de `weather.condition`, transición a/ desde modo `"solo"`, inicio o fin de festividad. No en cada heartbeat (evitar ruido).
- **Autenticación**: la conexión se autenti­ca con el JWT del handshake; el servidor nunca confía en un `userId` enviado por el cliente (Constitución V).

## Claves de Redis (estado efímero)

| Clave | Valor (JSON) | TTL | Propósito |
|-------|--------------|-----|-----------|
| `weather:{lat}:{lon}` | `{ temperature, weatherCode, condition, fetchedAt }` | 30 min | Cache de clima por coordenada (redondeada a 2 decimales). |
| `activity:{userId}` | `{ lastActiveAt, active, cpuUsage? }` | 3 h | Última actividad del usuario; expira sola (sin cola de limpieza). |

## Errores

| Código | Condición |
|--------|-----------|
| `401` | Token ausente, inválido o caducado en cualquiera de los 3 endpoints. |
| `400` | `POST /environmental/activity` con body malformado (tras validación/normalización). |

> Nota: los fallos de **Open-Meteo** **no** producen un `5xx`: se degradan a `weather.condition = "unknown"` (o último cacheado) y la petición responde `200`.

## Notas de implementación

- **Mapeo WMO → `condition`** (puro, `weather.mapper.ts`): `rain` (códigos 51-67, 80-82), `snow` (71-77, 85, 86), `cloud` (1-3), `clear` (0); `hot` si `temperature ≥ hot_temp` (30), `cold` si `temperature ≤ cold_temp` (5); `unknown` por defecto.
- **`timeOfDay`** por banda horaria local (puro, `time-of-day.ts`): `late_night` [00-05), `night` [05-08) o según convención, `morning`, `afternoon`, `evening` — definido por bandas sobre la hora local en `User.timezone`.
- **Modificadores de vitales** (en `applyLazyTick`): `hunger_hot` suma decaimiento de `hunger`, `happiness_rain` y `energy_snow` según `condition`; tasas de `balance.json → environmental`; acotado a [0, max].

