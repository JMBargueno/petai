# Implementation Plan: Edge Computing + CDN + Predictive Preloading

**Branch**: `009-edge-cdn` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/memory/features/009-edge-cdn/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Feature de performance/latencia de PetAI con tres piezas: (1) **CDN de assets** — un pipeline `build:assets` hashéa sprites SVG y game-data JSON, los publica en Cloudflare R2 con nombres versionados por hash y genera un `manifest.json` inmutable; el cliente (desktop Tauri/Svelte) los consume vía un `AssetLoader` con cache local en disco (`~/.petai/assets/`) y fallback a origin; (2) **edge function de auth** — `POST /v1/auth/refresh` se resuelve en el edge (stateless, validación de un refresh JWT vía JWKS) con p95 < 50ms, con fallback transparente al origin autoritativo; (3) **predictive preloading** — un `PredictivePreloader` del cliente pre-carga en background (prioridad `low`) los assets de la próxima etapa de evolución (umbrales 9/24/49 data-driven) y los assets de eventos próximos (<2h) para eliminar el "pop-in". El backend queda como origin (register/login/lógica) y como fallback; se añade `GET /events/upcoming` y métricas de CDN por región.

**Enfoque técnico**:
- **Pipeline de assets** en el root: `scripts/build-assets.ts` (`pnpm build:assets`) — escanea `shared/assets/` + `shared/game-data/`, MD5 por archivo, nombre `<name>-<hash>.<ext>`, upload a Cloudflare R2 y genera `assets/manifest.json` (`{ version, baseUrl, assets }`). Build **atómico**: el manifest se publica al final, tras el upload completo.
- **Origin backend** (NestJS): módulo `assets/` nuevo con `GET /v1/assets/manifest` y `GET /v1/assets/:key` (sirve `shared/` con `Cache-Control` correctos) — usado como fallback y como "mirror" del CDN. **No toca Prisma** (los assets son archivos).
- **Cliente desktop**: `AssetLoader` (fetch manifest → Map en memoria → `loadAsset(key)` → CDN → fallback origin → fallback embebido last-resort), caché local en disco `~/.petai/assets/`, deduplicación por `key`. `GameDataService` local cachea el game-data en memoria al iniciar.
- **`PredictivePreloader`** del cliente: lee `balance.leveling.stages` + estado del pet y `GET /events/upcoming`; encola pre-cargas con prioridad `low` + límite de concurrencia; se activa por eventos **locales** (cambio de nivel, evento próximo).
- **Edge auth** (Cloudflare Pages/Wrangler): `POST /v1/auth/refresh` fast-path stateless (JWKS) + fallback origin. El origen sigue emitiendo el refresh JWT fast-path en login/register además del refresh token hashed actual.
- **Observabilidad**: contadores `petai_cdn_hit_total`, `petai_cdn_fallback_origin_total`, `petai_cdn_refresh_ms` (etiqueta región) → Prometheus/Grafana (Feature #3).
- **Contrato**: los endpoints nuevos (`GET /v1/assets/manifest`, `GET /v1/assets/:key`, `GET /events/upcoming`) se documentan con `@nestjs/swagger` y se regeneran con `pnpm export:openapi` (Constitución III).

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS (backend y scripts); Svelte 5 + Vite 6 (desktop); Wrangler/Cloudflare Workers (edge, TS).

**Primary Dependencies**: NestJS 11, Prisma ORM (sin cambios de esquema), @nestjs/swagger, zod; cliente: `openapi-fetch` + `socket.io-client` + `@tauri-apps/api` (fs/http); edge: `@cloudflare/workers-types`, `jose` (verificación JWT); build: `@aws-sdk`/`wrangler` o API R2, `crypto` (MD5).

**Storage**: PostgreSQL 17 (vía Prisma) — **sin cambios de esquema**; Redis 7 (origin, no usado en edge v1). CDN: Cloudflare R2 (buckets) + Pages/edge. Cache local: `~/.petai/assets/` (desktop).

**Testing**: Jest (unitarios `.spec.ts` junto al código del backend y del script de build); Vitest (unitarios del cliente `AssetLoader`/`PredictivePreloader`); Supertest (E2E en `backend/test/` para `assets` y `events/upcoming`); test de edge con `wrangler dev`/miniflare.

**Target Platform**: Linux server (Docker) para origin; Cloudflare edge network; frontend Tauri 2 + Svelte 5 (desktop).

**Project Type**: web-service (REST origin) + edge functions + frontend desktop (Svelte) + build pipeline (root).

**Performance Goals**: assets < 200ms p95 global (SC-001); edge refresh < 50ms p95 (SC-002/AC3); fallback origin < 500ms p95 (SC-006); preloading no bloquea la UI (SC-007).

**Constraints**:
- Backend **autoritativo** (Constitución I): el origin sigue siendo la fuente de verdad para auth (register/login/logout/rotación/revocación) y para toda lógica de juego; el edge solo optimiza el refresh **stateless** y siempre con fallback a origin.
- Edge v1 **JWT-only** (sin Redis en edge): fast-path sin estado; la revocación dura queda en origin (access JWT edge ≤ `accessTokenTTL`).
- **Contrato único** (Constitución III): los endpoints origin nuevos usan `@nestjs/swagger` y se reflejan en `shared/openapi/openapi.json`.
- **Game-data data-driven** (Constitución IV): umbrales de pre-carga (9/24/49) y `assetPrefix` de eventos se leen de `shared/game-data/` (`balance.leveling.stages`, `festivals.json`), no hard-coded.
- Cache inmutable: assets por hash (`immutable`), manifest `max-age=3600, stale-while-revalidate=60`.
- El embebido `?raw` se conserva como **last-resort fallback** hasta estabilizar el CDN.
- Sin eventos WebSocket nuevos; preloading por eventos **locales** del cliente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Regla | Estado | Cómo se cumple |
|-----------|-------|--------|----------------|
| **I. Backend autoritativo** | Origin = fuente de verdad para auth y lógica; `userId` de sesión; transacciones atómicas | ✅ | El edge **solo** optimiza el refresh stateless y cae a origin. Register/login/logout/rotación/revocación y toda lógica de juego siguen en origin. El preloader no "afirma" nada de juego: solo descarga assets según umbrales data-driven que origin publica. `userId` nunca viaja en params de `assets`/`events`. |
| **II. Combate determinista** | No aplica directamente | ✅ N/A | Esta feature no toca el motor de combate ni el PRNG. |
| **III. Contrato único** | `@nestjs/swagger` → `shared/openapi/openapi.json` | ✅ | `AssetsController`, `EventsController` (`/events/upcoming`) expuestos con `@Api*`; `pnpm export:openapi` regenera el contrato. El edge no es un contrato origin; se documenta como contrato aparte (edge). |
| **IV. Game-data data-driven** | Config en `shared/game-data/*.json` validado (zod) con integridad cruzada | ✅ | Umbrales de pre-carga leídos de `balance.leveling.stages`; `assetPrefix` de eventos desde `festivals.json` (o Feature #5). El `AssetLoader` valida el game-data con el mismo schema zod del backend. |
| **V/VIII. Seguridad** | JWT; refresh tokens hashed; sin exponer secretos; env validado (zod) | ✅ | Refresh JWT fast-path firmado con la clave ya existente (JWKS público en edge); el refresh token hashed de origin no se toca; las credenciales de R2 y del edge van por env validado. El edge no loguea tokens en claro. |

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/009-edge-cdn/
├── spec.md              # Especificación (user stories, FR, SC)
├── plan.md              # Este archivo
├── tasks.md             # Tareas por user story
└── contracts/
    └── api-contract.md  # Contratos REST origin + edge + AssetLoader
```

### Source Code (repository root)

```text
scripts/
├── build-assets.ts                  # [NUEVO] hash MD5 + upload R2 + genera manifest
└── (build-assets.spec.ts)           # [NUEVO] tests del pipeline

backend/
└── src/
    └── modules/
        ├── assets/                   # [NUEVO] origin mirror: /v1/assets/manifest, /v1/assets/:key
        │   ├── assets.module.ts
        │   ├── assets.controller.ts
        │   ├── assets.service.ts
        │   └── dto/ (manifest.dto.ts)
        └── events/                   # [NUEVO o MOD] /events/upcoming (Feature #5)
            ├── events.controller.ts
            └── events.service.ts
    └── auth/ (auth.service.ts)       # [MOD] emitir refresh JWT fast-path en login/register
    └── export-openapi.ts             # [REGEN] pnpm export:openapi

edge/                                 # [NUEVO] Cloudflare Pages/Wrangler project
├── wrangler.toml
├── worker.ts                          # POST /v1/auth/refresh fast-path + fallback origin
└── tests/ (miniflare)

shared/
├── assets/                             # origen único (NO se modifica; el build lo lee)
│   ├── sprites/  patterns/  species/  palettes.json
├── game-data/                          # origen único (balance, species, festivals, ...)
└── openapi/
    ├── openapi.json                    # [REGEN] pnpm export:openapi
    └── api-types.ts                    # [REGEN]

desktop/
└── src/
    └── lib/
        ├── asset-loader.ts             # [NUEVO] fetch manifest, Map cache, loadAsset(key), fallback
        ├── asset-cache.ts              # [NUEVO] cache local ~/.petai/assets/ (Tauri fs)
        ├── predictive-preloader.ts     # [NUEVO] pre-carga próxima etapa + eventos próximos
        ├── game-data.client.ts         # [NUEVO] cache in-memory de game-data (zod)
        ├── auth.client.ts             # [MOD] refresh vía edge + fallback origin
        └── sprites.ts                  # [MOD] delega a asset-loader (conserva ?raw como last-resort)
```

## Plan de implementación (fases)

### Paso 1 — Pipeline de assets (root)  `scripts/build-assets.ts`
- Escanear `shared/assets/**` y `shared/game-data/*.json`.
- MD5 por archivo → `<name>-<hash8>.<ext>`; construir `manifest` `{ version, baseUrl, generatedAt, assets: { key: { url, hash, type, size } } }`.
- Upload a Cloudflare R2 (API/CLI) con `Cache-Control: immutable` para assets.
- Publicar `manifest.json` con `Cache-Control: max-age=3600, stale-while-revalidate=60`.
- Build **atómico**: el manifest se publica al final. Script: `pnpm build:assets`. Env: `CLOUDFLARE_R2_*` (validado con zod).

### Paso 2 — Origin mirror de assets (NestJS)
- `modules/assets/` con `GET /v1/assets/manifest` y `GET /v1/assets/:key` (sirve `shared/`, con los mismos `Cache-Control`). Fallback de red y "mirror" del CDN. DTOs con `@nestjs/swagger`.

### Paso 3 — `AssetLoader` + cache (desktop)
- `asset-loader.ts`: fetch del manifest (CDN, fallback origin) → Map en memoria → `loadAsset(key)` → URL versionada → cache local `~/.petai/assets/` (Tauri fs) → deduplicación por `key` → fallback origin (1 vez) → fallback embebido last-resort.
- `game-data.client.ts`: carga game-data JSON desde CDN, valida (zod, mismo schema del backend), cache en memoria.

### Paso 4 — `PredictivePreloader` (desktop)
- Leer `balance.leveling.stages` (umbrales 9/24/49) + estado del pet → encolar pre-carga de la próxima etapa (prioridad `low`, concurrencia limitada, sin bloquear UI).
- `GET /events/upcoming` → si `startsAt < 2h`, pre-cargar `assetPrefix`.
- Integrar con el estado local del pet (cambio de nivel / evento) sin WS nuevos.

### Paso 5 — Edge auth (Cloudflare)  `edge/worker.ts`
- Fast-path: verificar refresh JWT (JWKS), `exp`/`jti`/`typ`, emitir nuevo access JWT. p95 < 50ms.
- Fallback: origin `POST /v1/auth/refresh` (token legacy/revocado/expirado o error). Métrica `petai_cdn_refresh_ms`.
- `auth.service.ts` (origin): emitir el refresh JWT fast-path en login/register (además del refresh token hashed actual).
- `auth.client.ts` (desktop): refresh vía edge URL + fallback transparente a origin.

### Paso 6 — `GET /events/upcoming` (NestJS)
- `modules/events/` → `GET /events/upcoming` (24h) con `assetPrefix`. Fuente: Feature #5 o `festivals.json` (data-driven). DTOs + OpenAPI.

### Paso 7 — Observabilidad + OpenAPI
- Contadores `petai_cdn_hit_total`, `petai_cdn_fallback_origin_total`, `petai_cdn_refresh_ms` (etiqueta región) en Prometheus (Feature #3) + dashboard Grafana.
- `pnpm export:openapi` → `shared/openapi/openapi.json` con `assets` + `events/upcoming`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Una justificación menor (no es una violación, es un riesgo aceptado documentado):*

| Decisión | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| Edge auth v1 **JWT-only** (sin Redis en edge) | Cumple AC3 (<50ms) con mínima infra y sin nuevo backend | Redis-en-edge / lista de `jti` revocados añade complejidad y estado distribuido; se pospone a v2 (riesgo: revocación dura solo en origin, access JWT edge ≤ TTL). |
| Conservar el import `?raw` embebido como last-resort | Resiliencia: la app no se rompe si el CDN cae | Eliminar el embebido ahorra ~MB en el bundle, pero pierde el fallback ante caída total del CDN (edge case crítico). Se elimina en v2. |
## Riesgos y decisiones

| # | Decisión | Alternativa descartada | Razón |
|---|----------|------------------------|-------|
| 1 | Hash MD5 para el nombre de archivo | SHA-256 | MD5 es suficiente para versionar nombre (no uso criptográfico); SHA-256 allarga el nombre. [ver pregunta abierta #6] |
| 2 | Manifest `max-age=3600, stale-while-revalidate=60` | `no-cache` | `no-cache` haría revalidar en cada apertura (más red); SWR permite re-validar en background sin romper AC2 (cache 1h). |
| 3 | Build atómico (manifest al final) | Manifest incremental | Un manifest parcial apuntaría a assets aún no subidos; el upload completo primero garantiza consistencia (FR-015). |
| 4 | Preloading por eventos **locales** del cliente (sin WS) | Canal WS dedicado de "pre-load" | El spec confirma "sin WS events nuevos"; el nivel/evento ya son visibles en el cliente; un canal extra es infra innecesaria (YAGNI). |
| 5 | Pre-cargar solo especie actual + próximas etapas | Pre-cargar todas las especies | Ahorra red/disco (SC-007); las otras especies se cargan bajo demanda. |
| 6 | Edge cae a origin de forma transparente | Edge devuelve error al cliente | El usuario no debe percibir el cambio (SC-004); origin es autoritativo y siempre disponible como última instancia (Constitución I). |
| 7 | `GET /events/upcoming` desde `festivals.json` si Feature #5 no está | Bloquear hasta Feature #5 | Desacopla el preloading de eventos de Feature #5; el `assetPrefix` es data-driven (Constitución IV). |

## Notas para implementar

- **No hay cambios en `schema.prisma`**: los assets son archivos. El refresh JWT fast-path usa las claves JWT ya existentes (`@nestjs/jwt`); no requiere tabla.
- El módulo origin `assets/` **no existe** hoy; se crea. El módulo `events/` puede existir parcial por Feature #5; si no, se crea con `GET /events/upcoming`.
- `shared/assets/` y `shared/game-data/` son el **origen único** y no se modifican; `scripts/build-assets.ts` los lee. La estructura actual de `key`s se conserva: `sprites/<spriteKey>_<anim>`, `patterns/<id>`, `species/<id>/base`, `species/<id>/mask`, `game-data/<file>`.
- El cliente **valida** el game-data con el mismo schema zod del backend (`GameDataService`) para que el cache in-memory sea consistente (Constitución IV).
- `desktop/src/lib/sprites.ts` **delega** a `AssetLoader.loadAsset(...)` y conserva los imports `?raw` como last-resort hasta v2 (así la app no rompe si el CDN cae).
- El `AssetLoader` debe **deduplicar** (una descarga por `key`) para el race de preloading (edge case de spec).
- El `PredictivePreloader` lee los umbrales de `balance.leveling.stages` (9/24/49) y el `preloadWindow`; **nunca** hard-codes niveles.
- `GET /events/upcoming` devuelve `assetPrefix`; el preloader solo lo usa si `startsAt < 2h`.
- El edge **no loguea** tokens en claro (Constitución V/VIII) y expone la métrica `petai_cdn_refresh_ms` por región.
- Env del build (`CLOUDFLARE_R2_ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `BUCKET`, `ENDPOINT`) y del edge (`ORIGIN_URL`, `JWT_PUBLIC_KEY_JWKS_URL`) se validan con zod; en producción un valor público de `DEV_DEFAULTS` impide arrancar.
- `pnpm export:openapi` debe correr tras añadir los DTOs de `assets` y `events/upcoming` para regenerar `shared/openapi/openapi.json` (Constitución III).