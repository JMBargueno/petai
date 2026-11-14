---
description: "Task list for feature 009-edge-cdn implementation"
---

# Tasks: Edge Computing + CDN + Predictive Preloading

**Input**: Design documents from `.specify/memory/features/009-edge-cdn/`

**Prerequisites**: plan.md ✅, spec.md ✅, contracts/api-contract.md ✅

**Tests**: Tests unitarios incluidos (`.spec.ts` / Vitest). E2E origin en `backend/test/`. Edge con miniflare.

**Organization**: Tareas agrupadas por user story para implementación independiente.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: Puede ejecutarse en paralelo (archivos diferentes, sin dependencias)
- **[Story]**: A qué user story pertenece (US1..US4)
- Incluyen ruta exacta de archivo en la descripción

## Path Conventions

- **Pipeline de assets (root)**: `scripts/build-assets.ts`
- **Origin backend (NestJS)**: `backend/src/modules/`
- **Tests origin**: `backend/src/**\/*.spec.ts` (unit) + `backend/test/*.e2e-spec.ts` (E2E)
- **Game-data / assets**: `shared/game-data/`, `shared/assets/` (origen único, NO se modifican)
- **OpenAPI**: `shared/openapi/`
- **Edge (Cloudflare)**: `edge/`
- **Frontend desktop**: `desktop/src/lib/`
- **Tests desktop**: `desktop/src/lib/*.spec.ts` (Vitest)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pipeline de assets y verificación de infraestructura

- [ ] T001 Crear `scripts/build-assets.ts` [NUEVO]: escanea `shared/assets/**` + `shared/game-data/*.json`, MD5 por archivo, genera nombres `<name>-<hash8>.<ext>` y el `manifest` `{ version, baseUrl, generatedAt, assets: { key: { url, hash, type, size } } }`
  - Depende de: nada
  - **Nota**: base de US1; conserva la estructura de `key`s (`sprites/...`, `patterns/...`, `species/.../base`, `game-data/...`)
- [ ] T002 [P] Añadir el upload a Cloudflare R2 en `scripts/build-assets.ts` [MOD] con `Cache-Control: immutable` para assets y `max-age=3600, stale-while-revalidate=60` para el manifest; build **atómico** (manifest al final); env `CLOUDFLARE_R2_*` validado con zod
  - Depende de: T001
- [ ] T003 [P] Añadir script `build:assets` en `package.json` (root) y registrar `scripts/build-assets.spec.ts` (tests del hashing/manifest, sin upload real)
  - Depende de: nada

**Checkpoint**: pipeline de assets genera nombres versionados + manifest correcto y testado

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contrato + origin mirror que BLOQUEA las user stories de cliente

**⚠️ CRÍTICO**: Ninguna user story de cliente puede implementarse hasta completar esta fase

- [ ] T004 Crear `backend/src/modules/assets/` [NUEVO]: `assets.module.ts`, `assets.controller.ts` (`GET /v1/assets/manifest`, `GET /v1/assets/:key`), `assets.service.ts` (sirve `shared/` con `Cache-Control` correctos) y `dto/manifest.dto.ts`; registrar en `AppModule`
  - Depende de: T001 (formato del manifest)
- [ ] T005 [P] Añadir DTOs de Swagger (`@ApiProperty`) en `dto/manifest.dto.ts` y documentar `AssetsController` (Constitución III)
  - Depende de: T004
- [ ] T006 [P] Crear test unitario `backend/src/modules/assets/assets.controller.spec.ts` [NUEVO]: `GET /v1/assets/manifest` 200 (shape), `GET /v1/assets/:key` 200/404, `Cache-Control` correcto
  - Depende de: T004
- [ ] T007 [P] Crear test E2E `backend/test/assets.e2e-spec.ts` [NUEVO]: manifest + un asset sprite + un asset game-data + 404 de key inválida
  - Depende de: T004

---

## Phase 3: User Story 1 - Cargar sprites y game-data desde el CDN (Priority: P1) 🎯 MVP

**Goal**: El cliente carga assets y game-data desde el CDN con versioning por hash, cache local y fallback a origin.

**Independent Test**: Con `build:assets` corriendo, el desktop resuelve `loadAsset("sprites/ignisaur_idle")` contra el CDN, cachea localmente, y ante un 404 cae a `GET /v1/assets/:key`.

### Tests for User Story 1 (Vitest) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T008 [P] [US1] Test `desktop/src/lib/asset-loader.spec.ts` [NUEVO]: `loadAsset(key)` resuelve URL versionada, deduplica (1 descarga por key), fallback origin en 404 (1 vez), `AssetNotFound` si origin falla, fallback embebido last-resort
- [ ] T009 [P] [US1] Test `desktop/src/lib/game-data.client.spec.ts` [NUEVO]: carga game-data desde CDN, valida zod, cache en memoria (0 red tras arranque)

### Implementation for User Story 1

- [ ] T010 [US1] Crear `desktop/src/lib/asset-cache.ts` [NUEVO]: cache local en `~/.petai/assets/` (Tauri fs) — get/set/exists por `hash`
  - Depende de: Phase 2
- [ ] T011 [US1] Crear `desktop/src/lib/asset-loader.ts` [NUEVO]: fetch manifest (CDN → fallback origin) → Map en memoria → `loadAsset(key)` → cache local → fallback origin (1 vez) → fallback embebido; deduplicación por `key`
  - Depende de: T010
- [ ] T012 [US1] Crear `desktop/src/lib/game-data.client.ts` [NUEVO]: carga game-data JSON desde CDN, valida (zod, mismo schema del backend), cache in-memory
  - Depende de: T011
- [ ] T013 [P] [US1] Modificar `desktop/src/lib/sprites.ts` [MOD] para delegar a `AssetLoader.loadAsset(...)` y conservar los imports `?raw` como last-resort fallback
  - Depende de: T011

**Checkpoint**: MVP — sprites y game-data se sirven desde el CDN con cache + fallback (US1 testable de forma independiente)

---

## Phase 4: User Story 2 - Predictive preloading (sin "pop-in") (Priority: P2)

**Goal**: Precargar en background los assets de la próxima etapa de evolución y de eventos próximos (<2h).

**Independent Test**: Con un pet en `level: 8`, el preloader encoló y completó la pre-carga de `juvenile`; con un evento a <2h, pre-carga su `assetPrefix`.

### Tests for User Story 2 (Vitest) ⚠️

- [ ] T014 [P] [US2] Test `desktop/src/lib/predictive-preloader.spec.ts` [NUEVO]: nivel 8→pre-carga juvenile, 24→adult, 49→final; evento <2h → `assetPrefix`; no pre-carga fuera de especie actual+próximas; 100 preloads con concurrencia limitada

### Implementation for User Story 2

- [ ] T015 [US2] Crear `desktop/src/lib/predictive-preloader.ts` [NUEVO]: lee `balance.leveling.stages` (9/24/49, data-driven) + estado del pet → encola pre-carga de la próxima etapa (prioridad `low`, concurrencia limitada, sin bloquear UI); usa `AssetLoader`
  - Depende de: T011 (AssetLoader), T012 (game-data)
- [ ] T016 [US2] Integrar el preloader con el estado local del pet (cambio de nivel / evento próximo) sin WS nuevos [MOD]
  - Depende de: T015

---

## Phase 5: User Story 3 - Login instantáneo vía auth refresh en edge (Priority: P3)

**Goal**: `POST /v1/auth/refresh` resuelto en el edge (stateless) con p95 < 50ms, con fallback transparente a origin.

**Independent Test**: `wrangler dev`/miniflare: refresh JWT válido → `{ accessToken, refreshToken, user }` <50ms; token legacy/revocado → fallback origin; edge caído → cliente cae a origin.

### Tests for User Story 3 ⚠️

- [ ] T017 [P] [US3] Test edge `edge/tests/refresh.spec.ts` [NUEVO] (miniflare): fast-path (JWT válido), expirado/`jti` inválido → fallback, origin caído → error claro
- [ ] T018 [P] [US3] Test `backend/src/modules/auth/auth.service.spec.ts` [MOD]: login/register emiten el refresh JWT fast-path (claims `sub`,`jti`,`iat`,`exp`,`typ`)

### Implementation for User Story 3

- [ ] T019 [US3] Modificar `backend/src/modules/auth/auth.service.ts` [MOD]: emitir el refresh JWT fast-path en login/register (además del refresh token hashed actual)
  - Depende de: Phase 2
- [ ] T020 [US3] Crear `edge/` proyecto (Wrangler): `wrangler.toml`, `edge/worker.ts` [NUEVO] — fast-path (JWKS, `exp`/`jti`/`typ`) + fallback origin; métrica `petai_cdn_refresh_ms`; env `ORIGIN_URL`, `JWT_PUBLIC_KEY_JWKS_URL` validados
  - Depende de: T019
- [ ] T021 [P] [US3] Modificar `desktop/src/lib/auth.client.ts` [MOD]: refresh vía edge URL + fallback transparente a origin (1 reintento → origin)
  - Depende de: T020

**Checkpoint**: login instantáneo por edge con fallback origin (US3 testable de forma independiente)

---

## Phase 6: User Story 4 - Métricas de CDN y observabilidad por región (Priority: P4)

**Goal**: Visibilidad de CDN por región (hits, fallback, latencia p95) en Prometheus/Grafana.

**Independent Test**: `petai_cdn_hit_total` / `petai_cdn_fallback_origin_total` / `petai_cdn_refresh_ms` aparecen en Prometheus; un fallback origin incrementa el contador.

### Implementation for User Story 4

- [ ] T022 [US4] Añadir exposición de métricas de CDN (`petai_cdn_hit_total`, `petai_cdn_fallback_origin_total`) en el origin `assets`/observabilidad y del edge (`petai_cdn_refresh_ms`) con etiqueta de región [MOD]
  - Depende de: T004, T020
- [ ] T023 [P] [US4] Añadir dashboard Grafana "CDN por región" (hits, fallback, p95 refresh) en `infra/observability/grafana/dashboards/` [NUEVO]
  - Depende de: T022

**Checkpoint**: métricas de CDN visibles en Grafana por región

---

## Phase 7: Integration & Polish

**Purpose**: Integración cruzada, endpoint de eventos, OpenAPI y validación

- [ ] T024 [P] Crear `backend/src/modules/events/events.controller.ts` + `events.service.ts` [NUEVO o MOD]: `GET /events/upcoming` (24h) con `assetPrefix` (fuente: Feature #5 o `festivals.json`), DTOs + Swagger
- [ ] T025 [P] Crear test E2E `backend/test/events.e2e-spec.ts` [NUEVO]: `GET /events/upcoming` 200/401, shape con `assetPrefix`
- [ ] T026 [P] Exportar OpenAPI: `pnpm export:openapi` → actualizar `shared/openapi/openapi.json` (endpoints `assets` + `events/upcoming`) y `api-types.ts`
- [ ] T027 [P] Verificar integridad: `scripts/validate-assets.js` sigue pasando; manifest genera todas las `key`s existentes; preloader solo usa especie actual + próximas etapas
---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede comenzar inmediatamente.
- **Foundational (Phase 2)**: Depende de Setup (formato del manifest) — BLOQUEA las user stories de cliente.
- **User Stories (Phase 3-6)**: Todas dependen de Foundational (Phase 2).
  - US1 (Phase 3) es la base del cliente; US2 (Phase 4) depende de US1 (AssetLoader/game-data).
  - US3 (Phase 5) es independiente de US1/US2 (auth).
  - US4 (Phase 6) depende de US1 (assets) y US3 (edge refresh).
  - Pueden avanzar en paralelo si hay personal.
- **Polish (Phase 7)**: Depende de las user stories deseadas.

### User Story Dependencies

- **US1 (P1)**: Tras Foundational (Phase 2) — sin dependencias de otras stories (base del cliente).
- **US2 (P2)**: Tras US1 — usa el `AssetLoader`/game-data; testable de forma independiente.
- **US3 (P3)**: Tras Foundational — independiente de US1/US2 (auth edge); testable de forma independiente.
- **US4 (P4)**: Tras US1 + US3 — agregable al final; testable de forma independiente.

### Within Each User Story

- Tests escritos y FAIL antes de implementación.
- Cache (T010) antes que `AssetLoader` (T011); `AssetLoader` antes que preloader/sprites.
- Origin/emit fast-path (T019) antes que edge (T020); edge antes que `auth.client` (T021).
- Story completa antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- **Phase 1**: T002, T003 en paralelo con T001 (T002 depende de T001).
- **Phase 2**: T005, T006, T007 en paralelo tras T004.
- **US1**: T008, T009 (tests) en paralelo; T013 en paralelo con T012 tras T011.
- **US2/US3**: T014 (US2) y T017, T018 (US3) en paralelo; T015 y T019 en paralelo.
- **US4**: T022 y T023 en paralelo.
- **Cross-story**: tras Phase 2, Dev A → US1→US2, Dev B → US3, Dev C → US4 (tras US1/US3).
- **Phase 7**: T024, T025, T026, T027 en paralelo.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de US1 juntos:
Task: "asset-loader.spec.ts: loadAsset + dedup + fallback 404 + AssetNotFound (Vitest)"
Task: "game-data.client.spec.ts: carga CDN + zod + cache in-memory (Vitest)"

# Luego implementar en orden:
Task: "Crear asset-cache.ts (cache local ~/.petai/assets/, Tauri fs)"
Task: "Crear asset-loader.ts (manifest → Map → loadAsset → fallback origin/embebido)"
Task: "Crear game-data.client.ts (CDN + zod + cache in-memory)"
Task: "MOD sprites.ts → delega a AssetLoader (conserva ?raw last-resort)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001-T003)
2. Completar Phase 2: Foundational (T004-T007) — CRÍTICO, bloquea todo
3. Completar Phase 3: User Story 1 (T008-T013)
4. **PARAR Y VALIDAR**: Testear `loadAsset(key)` contra CDN + fallback origin de forma independiente
5. Deploy/demo del MVP (sprites y game-data desde el CDN)

### Incremental Delivery

1. Setup + Foundational → Fundación lista (manifest + origin mirror)
2. US1 → Testear → Deploy/Demo (**MVP!**)
3. US2 → Testear → Deploy/Demo (preloading anti pop-in)
4. US3 → Testear → Deploy/Demo (login instantáneo por edge)
5. US4 → Testear → Deploy/Demo (métricas por región)
6. Phase 7 → integración, `events/upcoming`, OpenAPI
7. Cada story agrega valor sin romper las anteriores

### Parallel Team Strategy

Con 3 developers:

1. **Todos juntos**: Setup + Foundational (Phase 1-2, ~1 día)
2. **Tras Phase 2**:
   - **Dev A**: US1 → US2 (CDN + preloading)
   - **Dev B**: US3 (auth edge)
   - **Dev C**: US4 (observabilidad) — tras US1/US3
3. **Todos juntos**: Phase 7 (integración, `events/upcoming`, OpenAPI, validación)
4. Las stories se integran de forma independiente

---

## Notes

- [P] tasks = archivos diferentes, sin dependencias entre sí
- [Story] label mapea la tarea a un user story específico para trazabilidad
- Cada user story debe ser completada y testeada de forma independiente
- **Importante**: No hay cambios en Prisma. El trabajo principal es:
  - Crear `scripts/build-assets.ts` (hash + upload R2 + manifest, build atómico)
  - Crear el módulo origin `assets/` (`/v1/assets/manifest`, `/v1/assets/:key`) como fallback/mirror
  - Crear `AssetLoader` + cache local + game-data in-memory en el desktop (y delegar `sprites.ts`)
  - Crear el `PredictivePreloader` (umbrales data-driven 9/24/49 + eventos <2h)
  - Crear el edge (Wrangler) de auth refresh (fast-path + fallback origin) y emitir el refresh JWT en origin
  - Añadir `GET /events/upcoming`, métricas de CDN y dashboard Grafana
  - Exportar OpenAPI (`pnpm export:openapi`)
- Commitear tras cada task o grupo lógico
- Parar en cada checkpoint para validar la story de forma independiente
- Evitar: tareas vagas, conflictos en el mismo archivo, dependencias cross-story que rompan independencia
- **Seguridad (Constitución V/VIII)**: el edge no loguea tokens en claro; las credenciales R2/edge se validan con zod y no usan valores de `DEV_DEFAULTS` en producción