# API Contract: Edge Computing + CDN + Predictive Preloading

**Feature**: `009-edge-cdn` | **Date**: 2026-11-13 | **Status**: Draft

## Convenciones

- **Base URL origin**: `/api/v1` (o `/` según configuración de Express).
- **Base URL CDN**: `https://cdn.petai.app/assets/` (placeholder; ver pregunta abierta #1).
- **Edge**: `POST /v1/auth/refresh` servido por Cloudflare (mismo path que origin, resuelto primero por el edge).
- **Auth**: Los endpoints de juego requieren `Authorization: Bearer <JWT>`. `GET /assets/manifest` y `GET /assets/*` son **públicos** (assets estáticos). `GET /events/upcoming` requiere Bearer JWT.
- **Content-Type**: `application/json` (JSON), `image/svg+xml` / `image/png` (assets).
- **Errores origin**: Formato estándar de `AppExceptionFilter`: `{ statusCode, message, error? }`.
- **Cache-Control**:
  - Assets (nombre por hash): `Cache-Control: public, max-age=31536000, immutable`.
  - Manifest: `Cache-Control: public, max-age=3600, stale-while-revalidate=60`.
- **Idioma**: los nombres de assets y eventos están en español donde aplique; las `key`s son técnicas (ASCII).
- **Key de asset**: ruta lógica dentro del manifest: `sprites/<spriteKey>_<anim>`, `patterns/<id>`, `species/<id>/base`, `species/<id>/mask`, `game-data/<file>`, `event/<...>`.

---

## Endpoints REST (Origin — fallback y mirror del CDN)

### 1. `GET /assets/manifest` (también `GET /v1/assets/manifest`)

Devuelve el índice versionado de assets.

**Auth**: Público (sin token).

**Headers de respuesta**: `Cache-Control: public, max-age=3600, stale-while-revalidate=60`, `ETag: <manifest-hash>`.

**Success `200`**:
```json
{
  "version": "2026.11.13-a3b2f1",
  "baseUrl": "https://cdn.petai.app/assets/",
  "generatedAt": "2026-11-13T09:00:00.000Z",
  "assets": {
    "sprites/ignisaur_idle": {
      "url": "sprites/ignisaur_idle-a3b2f1.svg",
      "hash": "a3b2f1c9d0e1f204",
      "type": "image/svg+xml",
      "size": 4213
    },
    "sprites/ignisaur_eat": {
      "url": "sprites/ignisaur_eat-7e0b12aa.svg",
      "hash": "7e0b12aa9c8d76ef",
      "type": "image/svg+xml",
      "size": 4501
    },
    "patterns/scales": {
      "url": "patterns/scales-4f9c0d21.png",
      "hash": "4f9c0d21b0a1c3d4",
      "type": "image/png",
      "size": 18340
    },
    "game-data/balance": {
      "url": "game-data/balance-9c2e4d0a.json",
      "hash": "9c2e4d0a1b3c5d7f",
      "type": "application/json",
      "size": 8120
    }
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `version` | string | Versión del manifest (fecha + hash corto) — cambia con cada deploy |
| `baseUrl` | string (URL) | Prefijo base del CDN; el `url` de cada asset es relativo a este |
| `generatedAt` | string (ISO 8601) | Fecha de generación del manifest |
| `assets` | object | Mapa `key → Asset` (ver AssetDto) |

**AssetDto**:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `url` | string | Ruta relativa versionada por hash (ej. `sprites/ignisaur_idle-a3b2f1.svg`) |
| `hash` | string (MD5 hex) | Hash del contenido — idempotente/inmutable |
| `type` | string (MIME) | `image/svg+xml`, `image/png`, `application/json`, ... |
| `size` | number | Tamaño en bytes |

**Errors**:

| Status | Condition | Response |
|--------|-----------|----------|
| `500` | Manifest no generado / `shared/` inaccesible | `{ statusCode: 500, message: "..." }` |

### 2. `GET /assets/:key` (también `GET /v1/assets/:key`)

Sirve un asset estático (fallback del CDN y mirror origin). `:key` es la `key` del manifest (sin hash), p. ej. `sprites/ignisaur_idle` → `GET /assets/sprites/ignisaur_idle`.

**Auth**: Público (sin token).

**Headers de respuesta**: `Cache-Control: public, max-age=31536000, immutable`, `Content-Type` según `type`.

**Success `200`**: cuerpo binario/JSON del asset.

**Errors**:

| Status | Condition | Response |
|--------|-----------|----------|
| `400` | `:key` mal formado (p. ej. `..` path traversal) | `{ statusCode: 400, message: "Key inválida" }` |
| `404` | `:key` no existe en `shared/` | `{ statusCode: 404, message: "Asset no encontrado" }` |
| `500` | Error interno de lectura | `{ statusCode: 500, message: "..." }`

---

### 3. `GET /events/upcoming` (también `GET /v1/events/upcoming`)

Devuelve los eventos de juego de las próximas 24h, con el prefijo de assets a pre-cargar.

**Auth**: Bearer JWT (obligatorio).

**Query params**: Ninguno (ventana fija de 24h).

**Success `200`**:
```json
{
  "windowHours": 24,
  "events": [
    {
      "id": "winter-2026",
      "name": "Invierno 2026",
      "type": "festival",
      "startsAt": "2026-11-13T22:00:00.000Z",
      "endsAt": "2026-11-20T23:59:00.000Z",
      "assetPrefix": "event/winter2026/"
    },
    {
      "id": "xp-weekend",
      "name": "Fin de semana de XP",
      "type": "buff",
      "startsAt": "2026-11-14T18:00:00.000Z",
      "endsAt": "2026-11-15T23:59:00.000Z",
      "assetPrefix": "event/xpweekend/"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `windowHours` | number | Ventana del endpoint (24) |
| `events[]` | UpcomingEventDto[] | Eventos próximos (0..N) |

**UpcomingEventDto**:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID del evento |
| `name` | string (es) | Nombre para la UI |
| `type` | string | `festival`, `buff`, `raid`, ... |
| `startsAt` | string (ISO 8601) | Inicio |
| `endsAt` | string (ISO 8601) / null | Fin |
| `assetPrefix` | string / null | Prefijo de assets a pre-cargar (el preloader lo usa si `startsAt < 2h`) |

**Errors**:

| Status | Condition | Response |
|--------|-----------|----------|
| `401` | Token ausente/inválido/expirado | `{ statusCode: 401, message: "Unauthorized" }` |
| `500` | Fuente de eventos inaccesible | `{ statusCode: 500, message: "..." }` |

**Fuente de datos**: Feature #5 (sistema de eventos) o `shared/game-data/festivals.json` (data-driven) como fallback. El `assetPrefix` debe corresponder a `key`s existentes en el manifest.

---

## Edge Function (Cloudflare)

### `POST /v1/auth/refresh` (EDGE fast-path)

Mismo path que origin. El edge resuelve primero (fast-path stateless) y cae al origin cuando no puede.

**Request** (`Content-Type: application/json`):
```json
{ "refreshToken": "<refresh-jwt-fast-path | refresh-token-legacy>" }
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `refreshToken` | string | Refresh JWT fast-path (emitido en login/register) o refresh token legacy (hashed en origin) |

**Fast-path (edge, stateless)**: el edge verifica el refresh JWT contra el JWKS público (`exp`, `jti`, `typ: "refresh"`) y, si es válido, emite un nuevo access JWT. **No** toca la base de datos.

**Success `200`** (idéntico al contrato de origin):
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<refresh-jwt-fast-path>",
  "user": {
    "id": "0d7c...a1",
    "email": "jugador@petai.app",
    "displayName": "Astro"
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `accessToken` | string (JWT) | Access JWT corto (`exp` ~15min), claims `sub`, `iat`, `exp`, `typ: "access"` |
| `refreshToken` | string (JWT) | Refresh JWT fast-path rotado (`exp` horas) |
| `user` | object | `{ id, email, displayName }` (del claim `sub` + payload firmado) |

**Latencia objetivo**: p95 < 50ms (fast-path, AC3/SC-002).

**Fallback (origin)**: si el `refreshToken` no es un refresh JWT fast-path válido (legacy/revocado/expirado), o si el edge falla (503/timeout), el edge/proxy reenvía al origin `POST /v1/auth/refresh`, que valida el hash en `RefreshToken`, rota el token de forma autoritativa y responde con el mismo shape. El cliente no percibe el cambio (FR-012).

**Errors**:

| Status | Condition | Response |
|--------|-----------|----------|
| `400` | Body vacío o sin `refreshToken` | `{ statusCode: 400, message: "refreshToken requerido" }` |
| `401` | Refresh inválido/expirado/revocado (fast y origin) | `{ statusCode: 401, message: "Sesión inválida" }` |
| `502` | Edge cae a origin y origin falla | `{ statusCode: 502, message: "Origin no disponible" }` |
| `503` | Edge caído sin fallback disponible | `{ statusCode: 503, message: "Edge no disponible" }` |

---

## Cliente — AssetLoader (contrato interno)

API del `AssetLoader` del desktop (consumo del manifest + cache):

```ts
interface Asset { url: string; hash: string; type: string; size: number }
interface Manifest { version: string; baseUrl: string; generatedAt: string; assets: Record<string, Asset> }

class AssetLoader {
  /** Carga el manifest (CDN → fallback origin) y lo cachea en memoria. */
  init(): Promise<Manifest>;
  /** Devuelve la URL absoluta (CDN) de una key. `null` si la key no está en el manifest. */
  resolve(key: string): string | null;
  /**
   * Descarga un asset: cache local ~/.petai/assets/<hash> → CDN → fallback origin (1 vez)
   * → fallback embebido last-resort. Deduplica por `key` (una sola descarga).
   * `priority: 'low' | 'normal'` (el preloader usa 'low').
   */
  loadAsset(key: string, opts?: { priority?: 'low' | 'normal' }): Promise<Blob>;
  /** `true` si el asset ya está en cache local. */
  isCached(key: string): boolean;
  /** Limpia assets obsoletos del cache local (opcional, tras un re-deploy). */
  pruneStale(): Promise<void>;
}
```

**Comportamiento de fallback** (orden fijo): `cache local (por hash) → CDN (URL versionada) → origin GET /v1/assets/:key (1 vez) → embebido (?raw) last-resort → `AssetNotFound`. Un 404 de CDN dispara `petai_cdn_fallback_origin_total`.

**Game-data** (`game-data.client.ts`): carga `game-data/<file>` desde el CDN, valida con el schema zod compartido y lo cachea en memoria; `getBalance()`/`getSpecies()`/etc. leen de memoria (0 red tras el arranque, SC-005).

---

## Cliente — PredictivePreloader (contrato interno)

```ts
interface PreloadDecision { stage?: 'juvenile' | 'adult' | 'final'; eventPrefix?: string; keys: string[]; priority: 'low' }

class PredictivePreloader {
  /** Evalúa el estado del pet y encola pre-cargas (prioridad low, concurrencia limitada). */
  evaluate(pet: { speciesId: string; stage: string; level: number }): Promise<PreloadDecision[]>;
  /** Pre-carga los assets de un evento próximo si `startsAt < 2h`. */
  enqueueEvent(evt: { startsAt: string; assetPrefix?: string }): Promise<PreloadDecision | null>;
}
```

**Reglas**:
- Umbrales de etapa **data-driven** desde `balance.leveling.stages` (9/24/49); no hard-coded (FR-008).
- Pre-carga **solo** la especie actual + próximas etapas (no todas las especies; SC-007).
- Pre-carga de evento solo si `startsAt < 2h` y `assetPrefix` no es `null` (AC5).
- Prioridad `low` + límite de concurrencia; no bloquea el hilo principal/UI (SC-007).
- Deduplica: usa `AssetLoader.isCached(key)` para no re-descargar.
- Se activa por **eventos locales** del cliente (cambio de nivel, evento próximo); **sin** WS nuevos.

---

## Observabilidad (métricas)

| Métrica | Tipo | Etiqueta(s) | Descripción |
|---------|------|-------------|-------------|
| `petai_cdn_hit_total` | counter | `region`, `key` (opcional) | Hits de cache del CDN por región (US4) |
| `petai_cdn_fallback_origin_total` | counter | `region`, `key` (opcional) | Miss → fallback a origin (AC6/SC-006) |
| `petai_cdn_refresh_ms` | histogram | `region`, `outcome` (`edge`/`origin`) | Latencia del refresh (p95 < 50ms; AC3/SC-002) |

**Camino**: expuestas en el origin (Prometheus, Feature #3) y en el edge (histograma); dashboard Grafana "CDN por región" (Phase 6, T023).

---

## Resumen de errores globales

| Status | Error | Cuándo |
|--------|-------|--------|
| `400` | `Bad Request` | `:key` mal formado (path traversal) en `/assets/:key`; `refreshToken` ausente en refresh |
| `401` | `Unauthorized` | Token inválido/expirado en `GET /events/upcoming`; refresh inválido/expirado/revocado (edge u origin) |
| `404` | `Not Found` | `:key` no existe en `shared/` (asset) |
| `500` | `Internal Server Error` | Manifest no generado; fuente de eventos inaccesible; fallo de DB/lectura |
| `502` | `Bad Gateway` | Edge cae a origin y origin falla |
| `503` | `Service Unavailable` | Edge caído sin fallback disponible |

**Error del cliente** (`AssetNotFound`): lanzado por `AssetLoader.loadAsset` si cache → CDN → origin → embebido no resuelven la `key`; la UI muestra un placeholder sin bloquear el render.