# Feature Specification: Edge Computing + CDN + Predictive Preloading

**Feature Branch**: `009-edge-cdn`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Añadir a PetAI (a) un CDN para los assets — sprites SVG y game-data JSON — con versioning por hash; (b) una edge function para el auth refresh (<50ms); y (c) lógica de predictive preloading en el cliente (evolución inminente → sprites de la nueva etapa precargadas; evento próximo → assets del evento). El objetivo es reducir la carga y la latencia del backend al escalar, eliminar el «pop-in» de sprites al evolucionar y hacer el login instantáneo al reabrir la app. El backend queda solo para register/login y la lógica de juego."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cargar sprites y game-data desde el CDN (Priority: P1)

Como jugador, al abrir la app quiero que los sprites de mi mascota y los datos de juego (balance, especies, comidas, patrones) carguen al instante desde el CDN más cercano, sin hacer esperar al backend. Como dev, quiero que cada asset se distribuya con un nombre versionado por hash (`sprite-ignisaur-a3b2f1.svg`) para que el cache sea immutable (sin invalidations) y que un `manifest.json` me diga qué hay disponible.

**Why this priority**: Es la "columna vertebral" de toda la feature. Sin la distribución de assets por CDN no hay latencia reducida, ni preloading que pre-cargar, ni cache in-memory de game-data. Es la base sobre la que se construyen el preloading predictivo (US2) y el auth edge (US3). El backend actual sirve los assets de forma embebida; migrar a CDN + manifest + fallback es el cambio estructural principal.

**Independent Test**: Se testea por completo corriendo `build:assets` (hash MD5 + upload + manifest), y verificando: (1) `GET /assets/manifest` devuelve `{ version, assets: { key: { url, hash, type, size } } }` con `Cache-Control: max-age=3600`; (2) cada URL de asset devuelve el contenido con `Cache-Control: immutable`; (3) si el CDN devuelve `404` para un asset, el cliente cae al origin (`/v1/assets/...`) y lo resuelve (AC6); (4) los game-data JSON se sirven desde CDN y el cliente los cachea en memoria al iniciar.

**Acceptance Scenarios**:

1. **Given** un asset `sprites/ignisaur_idle` subido al CDN con hash `a3b2f1`, **When** el cliente llama a `loadAsset("sprites/ignisaur_idle")`, **Then** se resuelve la URL versionada `sprites/ignisaur_idle-a3b2f1.svg` y se descarga con `Cache-Control: public, max-age=31536000, immutable` (AC1).
2. **Given** el `manifest.json` está servido con `max-age=3600`, **When** el cliente lo fetcha por primera vez y luego de nuevo <1h después, **Then** la segunda lectura se sirve desde cache local sin red (AC2).
3. **Given** el CDN devuelve `404` para `sprites/ignisaur_idle-a3b2f1.svg` (cache purgado / edge frío), **When** el `AssetLoader` lo intenta, **Then** cae al origin `GET /v1/assets/sprites/ignisaur_idle` y devuelve el contenido con `200` (AC6).
4. **Given** `balance.json` versionado en el CDN, **When** la app arranca, **Then** se carga una vez, se valida (zod) y se cachea en memoria; `GameDataService` local devuelve `getBalance()` sin red (AC7).
5. **Given** un asset no existente `sprites/ghost_idle`, **When** se llama `loadAsset("sprites/ghost_idle")`, **Then** el `AssetLoader` propaga un error `AssetNotFound` (sin caer infinitamente a origin) y el render usa un fallback placeholder.

---

### User Story 2 - Predictive preloading (sin "pop-in") (Priority: P2)

Como jugador, cuando mi mascota está por evolucionar (o hay un evento de juego imminente) quiero que los sprites/datos de esa próxima etapa ya estén descargados en segundo plano, para que al evolucionar no aparezca una pausa de "cargando" ni un sprite que tarda en aparecer.

**Why this priority**: Es la pieza diferenciadora de experiencia ("sin pop-in"). Depende de US1 (necesita el `AssetLoader` + manifest para saber qué pre-cargar). Es independiente en el sentido de que se puede implementar y testear sobre el `AssetLoader` ya funcionando, sin tocar el CDN.

**Independent Test**: Se testea simulando en el cliente un pet en `level: 8` (a punto de `juvenile` en nivel 9) y verificando que, antes de llegar al nivel 9, el `PredictivePreloader` encoló y completó la pre-carga de los sprites de `juvenile` (prioridad `low`, en background, sin bloquear la UI). Igualmente, con un evento a <2h, se precargan sus assets.

**Acceptance Scenarios**:

1. **Given** un pet `baby` en `level: 8` (el umbral de `juvenile` es 9, desde `balance.leveling.stages`), **When** el `PredictivePreloader` evalúa, **Then** inicia la pre-carga (prioridad `low`, background) de los sprites de la etapa `juvenile` de esa especie (AC4).
2. **Given** un pet `juvenile` en `level: 24` (umbral de `adult`) y otro `adult` en `level: 49` (umbral de `final`), **When** el preloader evalúa, **Then** pre-carga `adult` y `final` respectivamente (AC4, umbrales data-driven 9/24/49).
3. **Given** `GET /events/upcoming` devuelve un evento con `startsAt` a <2h y `assetPrefix: "event/winter2026/"`, **When** el preloader evalúa, **Then** pre-carga los assets bajo ese prefijo (AC5).
4. **Given** la pre-carga de la próxima etapa ya está terminada, **When** el pet efectivamente evoluciona (evento `pet:evolved` / cambio de stage), **Then** los sprites ya están en cache local y la transición se renderiza sin red (sin pop-in).
5. **Given** 100 preloads encolados simultáneamente, **When** el cliente los procesa, **Then** se procesan con prioridad `low` y un límite de concurrencia, sin bloquear el hilo principal ni la UI (requisito de no-quebrar la UX).

---

### User Story 3 - Login instantáneo vía auth refresh en edge (Priority: P3)

Como jugador, al reabrir la app con una sesión válida quiero que el login sea instantáneo (<50ms) porque el refresh de token se resuelve en el edge más cercano, sin esperar al backend origin. Como devops, quiero que si el edge no puede (fallback), el origen responda de forma transparente sin romper la sesión.

**Why this priority**: Reduce el time-to-login, pero no es el bloqueador del MVP (la sesión existente ya funciona por origin). Se implementa sobre el auth ya existente; depende de que el cliente ya consuma el `AssetLoader`/auth (US1). Aislable: se puede testear la edge function de forma independiente.

**Independent Test**: Se testea invocando `POST /v1/auth/refresh` contra el edge con un refresh JWT válido y midiendo p95 (<50ms, AC3); y verificando que con un refresh token legacy/expirado/revocado el edge cae al origin (`POST /v1/auth/refresh` origin) que rota el token de forma autoritativa.

**Acceptance Scenarios**:

1. **Given** un refresh JWT (fast-path) válido y no revocado, **When** el cliente llama a `POST /v1/auth/refresh` en el edge, **Then** el edge valida la firma (JWKS público), comprueba `exp`/`jti` y devuelve `{ accessToken, refreshToken, user }` en p95 < 50ms (AC3), sin tocar la base de datos.
2. **Given** un refresh token legacy (hashed en origin) o un refresh JWT revocado/expirado, **When** el edge no puede resolverlo de forma stateless, **Then** hace fallback al origin `POST /v1/auth/refresh`, que valida el hash en `RefreshToken`, rota el token y responde (vía autoritativa).
3. **Given** el edge está caído (503/timeout), **When** el cliente intenta el refresh, **Then** el cliente reintenta una vez y luego cae al origin de forma transparente; el usuario no percibe un error de sesión (si el token es válido).
4. **Given** el refresh JWT fast-path fue emitido por login pero el usuario cambió la contraseña (revocación en origin), **When** el edge lo valida, **Then** la sesión sigue viva como máximo el `accessTokenTTL` (~15min); la revocación dura queda garantizada en origin (riesgo aceptado, ver plan).

---

### User Story 4 - Métricas de CDN y observabilidad por región (Priority: P4)

Como devops, quiero ver métricas de CDN por región (hits de cache, miss → fallback origin, latencia p95 por asset) para dimensionar coste y detectar problemas, y quiero que el manifest y las URL versionadas sean consistentes.

**Why this priority**: Es soportiva (observabilidad) y no bloquea la experiencia del jugador. Añade visibilidad para operar el CDN; se apoya sobre la infra de observabilidad existente (Prometheus/Grafana, Feature #3) y sobre el pipeline de US1.

**Independent Test**: Se testea exponiendo contadores (`petai_cdn_hit_total`, `petai_cdn_fallback_origin_total`, `petai_cdn_refresh_ms`) y verificando que aparecen en Prometheus/Grafana y que un fallback origin dispara el contador correspondiente.

**Acceptance Scenarios**:

1. **Given** un hit de cache del CDN y un miss que cae a origin, **When** el cliente/edge los procesa, **Then** se incrementan `petai_cdn_hit_total` / `petai_cdn_fallback_origin_total` con etiqueta de región.
2. **Given** una edge refresh, **When** se resuelve, **Then** se registra `petai_cdn_refresh_ms` (histograma) y el dashboard Grafana muestra p95 por región.
3. **Given** un deploy de assets con hash nuevo, **When** se regenera el manifest, **Then** la `version` del manifest cambia y las URL antiguas quedan inmutables (sin invalidation).

---

### Edge Cases

- **CDN caído total**: el cliente debe poder seguir usando la app con los assets embebidos de fallback (los `?raw` actuales se conservan como last-resort) y el `AssetLoader` no debe bloquear el render.
- **Asset 404 en CDN**: fallback a origin una vez; si origin también falla, `AssetNotFound` + placeholder (sin bucle infinito de reintento).
- **Token expirado en edge**: el edge devuelve `401` fast; el cliente reintenta por origin; si origin también `401`, el cliente fuerza re-login.
- **Race de preloading**: dos evaluaciones del preloader (nivel y evento) piden el mismo asset → el `AssetLoader` debe deduplicar (una sola descarga por `key`).
- **Manifest out-of-sync**: el CDN sirva un manifest más antiguo que un asset recién subido → el hash en el nombre del asset lo hace inmutable; el manifest solo se actualiza tras el upload completo (build atómico).
- **Offline / baja conectividad**: los assets ya en cache local (`~/.petai/assets/`) se sirven sin red; el game-data en memoria sigue disponible.
- **Cambio de contraseña/logout**: la revocación dura es autoritativa en origin; el access JWT edge vive ≤ `accessTokenTTL` (riesgo aceptado documentado en plan).
## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST generar un pipeline `build:assets` que hashéa (MD5) cada asset de `shared/assets/` y `shared/game-data/`, produce nombres versionados (`<name>-<hash>.<ext>`) y los publica en el CDN.
- **FR-002**: El sistema MUST publicar un `GET /assets/manifest` (también en origin `GET /v1/assets/manifest`) que devuelve `{ version, baseUrl, assets: { key: { url, hash, type, size } } }`.
- **FR-003**: Los assets con nombre por hash MUST servirse con `Cache-Control: public, max-age=31536000, immutable`; el manifest con `Cache-Control: public, max-age=3600, stale-while-revalidate=60`.
- **FR-004**: El cliente MUST implementar un `AssetLoader` que fetcha el manifest, cachea la lista en memoria y resuelve `loadAsset(key)` → URL del CDN, con caché local en disco (`~/.petai/assets/`).
- **FR-005**: El `AssetLoader` MUST implementar fallback a origin (`GET /v1/assets/:key`) ante un `404`/error de CDN, una única vez, propagando `AssetNotFound` si origin también falla.
- **FR-006**: El cliente MUST servir los game-data JSON desde el CDN y cachearlos en memoria al iniciar (validación zod), de modo que `GameDataService` local no haga red por lectura.
- **FR-007**: El cliente MUST implementar un `PredictivePreloader` que, según el estado del pet (nivel/etapa) y los eventos próximos, pre-carga (prioridad `low`, background, sin bloquear UI) los assets de la próxima etapa de evolución.
- **FR-008**: Los umbrales de pre-carga de etapa (9/24/49) MUST ser data-driven desde `balance.leveling.stages` (o un parámetro `preloadWindow`), no hard-coded.
- **FR-009**: El backend MUST exponer `GET /events/upcoming` (eventos en las próximas 24h) con `assetPrefix` para que el preloader precargue sus assets si `startsAt < 2h`.
- **FR-010**: El sistema MUST exponer `POST /v1/auth/refresh` en el edge (fast-path stateless, validación de refresh JWT vía JWKS) que devuelve `{ accessToken, refreshToken, user }` con p95 < 50ms.
- **FR-011**: El edge de auth MUST fallback al origin `POST /v1/auth/refresh` cuando el refresh no sea resolvable de forma stateless (token legacy/revocado/expirado) o el edge falle; origin rota el token de forma autoritativa.
- **FR-012**: El cliente MUST consumir los refresh vía edge URL con fallback transparente a origin, sin romper la sesión en caso de fallo de edge.
- **FR-013**: El sistema MUST exponer métricas de observabilidad (`petai_cdn_hit_total`, `petai_cdn_fallback_origin_total`, `petai_cdn_refresh_ms`) con etiqueta de región, visibles en Prometheus/Grafana.
- **FR-014**: El `AssetLoader` MUST deduplicar peticiones: dos consumidores que piden el mismo `key` disparan una sola descarga.
- **FR-015**: El pipeline de assets MUST ser atómico: el manifest solo se publica tras el upload completo de todos los assets; los assets con hash no se invalidan (solo se añaden).

### Key Entities

- **Asset**: un recurso estático servible por CDN (sprite SVG, patrón PNG, `base.png`/`mask.png` de especie, o game-data JSON). Atributos: `key` (lógico, p. ej. `sprites/ignisaur_idle`), `url` (versionada por hash), `hash` (MD5 hex), `type` (MIME), `size`.
- **AssetManifest**: índice versionado de assets. Atributos: `version`, `baseUrl`, `generatedAt`, `assets: Map<key, Asset>`. Se sirve en CDN + origin.
- **RefreshToken (fast-path)**: un refresh JWT short-lived emitido en login/register, firmado con la clave del backend, con claims `sub` (userId), `jti`, `iat`, `exp`, `typ: "refresh"`. Usado por la edge fast-path (stateless). Distinto del `RefreshToken` hashed existente en origin.
- **UpcomingEvent**: un evento de juego próximo (Feature #5). Atributos: `id`, `name`, `startsAt` (ISO), `assetPrefix` (prefijo de assets a pre-cargar), `type`.
- **EvolutionStageThreshold**: umbral de nivel para cada etapa, derivado de `balance.leveling.stages` (baby→9→juvenile→24→adult→49→final). Atributos: `stage`, `minLevel`.
## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95% de los assets (sprites y game-data) se sirven en < 200ms p95 global desde el CDN (latencia de `loadAsset(key)` en red).
- **SC-002**: El auth refresh en edge (`POST /v1/auth/refresh`) responde en < 50ms p95 con un refresh JWT válido (fast-path stateless).
- **SC-003**: El 100% de las transiciones de evolución que tienen la próxima etapa pre-cargada se renderizan sin pausa de "cargando" (sin pop-in): los sprites de la nueva etapa están en cache local antes de evolucionar.
- **SC-004**: El tiempo desde que se reabre la app hasta que la sesión está autenticada (<1s) mejora frente al baseline origin, sin degradar la tasa de éxito de login (no se rompen sesiones por fallback).
- **SC-005**: El 100% de los game-data JSON se sirven desde el CDN y se leen en memoria (0 peticiones de red por `getBalance()`/`getSpecies()` tras el arranque).
- **SC-006**: Ante un `404` de CDN, el fallback a origin resuelve el asset en < 500ms p95 y el contador `petai_cdn_fallback_origin_total` se incrementa (observabilidad por región disponible en Grafana).
- **SC-007**: Un preloader con 100 preloads encolados no degrada la interactividad de la UI (sin bloqueo del hilo principal; prioridad `low` y límite de concurrencia), y no descarga assets fuera de la especie actual + próximas etapas.

## Assumptions

- Se reutiliza el sistema de autenticación existente (Bearer JWT + refresh tokens hashed en origin). La edge fast-path (US3) emite además un refresh JWT short-lived firmado con la clave ya existente; **no** se introduce un backend separado para auth (Constitución I: origin sigue siendo autoritativo para register/login/logout/rotación/revocación).
- Los assets están actualmente **embebidos** en el build del desktop (`desktop/src/lib/sprites.ts` con `@shared/assets/sprites/*.svg?raw`). Se migra a CDN + cache local `~/.petai/assets/`, conservando el embebido como **last-resort fallback** (no se elimina el import `?raw` hasta que el CDN esté estable en producción).
- El CDN elegido es **Cloudflare** (R2/Pages). Coste: el plan free (≈100GB egress, ~10M req/mes) es suficiente para v1 (ver preguntas abiertas #1).
- El pipeline `build:assets` (hash + upload + manifest) se añade como script de root (`scripts/build-assets.ts` / `pnpm build:assets`), separado de `build` del frontend; el upload usa la API/CLI de Cloudflare (R2) con credenciales por env.
- `shared/assets/` (sprites, patterns, species, palettes.json) y `shared/game-data/*.json` son el origen único de assets; el pipeline los lee sin modificarlos. La estructura actual (`sprites/<spriteKey>_<anim>.svg`, `patterns/<id>.png`, `species/<id>/{base,mask}.png`) se conserva en las `key`s del manifest.
- Los umbrales de etapa de evolución son data-driven en `balance.leveling.stages` (9/24/49); el preloader los lee de ahí (o de un `preloadWindow`), nunca hard-codes.
- `GET /events/upcoming` depende de **Feature #5** (sistema de eventos). Si Feature #5 no está listo, este endpoint se puede servir desde `shared/game-data/festivals.json` (data-driven) como fuente; el preloader usa su `assetPrefix`.
- El backend sigue sirviendo los assets en origin (`GET /v1/assets/manifest` y `GET /v1/assets/:key`) como fallback y como origen del upload; no se crea ningún registro nuevo en Prisma.
- La validación de los game-data en el cliente reutiliza el mismo esquema zod del backend (`GameDataService`), de modo que el cache in-memory sea consistente.
- Esta spec cubre: pipeline de assets, `AssetLoader`, `PredictivePreloader`, edge function de auth, endpoint `GET /events/upcoming` y métricas. No introduce eventos WebSocket nuevos (el spec lo confirma); el preloading se activa por eventos **locales** del cliente (nivel, evento próximo).
- La edge function de auth v1 es **JWT-only** (sin Redis en edge). La revocación dura (logout, cambio de contraseña) queda garantizada en origin; el access JWT edge vive ≤ `accessTokenTTL` (~15min) — riesgo aceptado (ver plan y preguntas abiertas #3).

## Preguntas abiertas

1. **Cloudflare vs Vercel?** → Propuesta del spec: Cloudflare. Decisión: Cloudflare R2 (buckets + Pages) por el plan free y el edge network. [NEEDS CLARIFICATION: confirmar el plan de facturación y el dominio del CDN.]
2. **Assets embebidos actualmente?** → Propuesta del spec: SÍ → migrar a CDN + cache. Decisión: migrar manteniendo el embebido como last-resort fallback hasta estabilizar el CDN en producción.
3. **Edge con Redis o solo JWT?** → Propuesta del spec: v1 JWT solo, v2 Redis edge. Decisión v1: JWT-only (stateless). Riesgo aceptado: la revocación dura por logout/cambio de contraseña se aplica en origin; un access JWT edge emitido antes de la revocación vive ≤ `accessTokenTTL`. [NEEDS CLARIFICATION: si el negocio exige revocación instantánea global, se adelanta la v2 (Redis edge o lista de `jti` revocados en edge).]
4. **Pre-cargar todas las especies?** → Propuesta del spec: solo actual + próximas etapas. Decisión: solo la especie actual + próximas etapas (baby→juvenile→adult→final); no todas las especies.
5. **TTL del manifest en el cliente** → El manifest tiene `max-age=3600` (AC2), pero para que un deploy de assets llegue "rápido" se usa `stale-while-revalidate=60`; [NEEDS CLARIFICATION: si se desea un re-check más agresivo (p. ej. `stale-while-revalidate=10` + revalidación en foreground al abrir la app).]
6. **Hash MD5 vs SHA-256** → El spec propone MD5 (suficiente para versionar nombre de archivo, no es uso criptográfico). Decisión: MD5 para el nombre de archivo; [NEEDS CLARIFICATION: si el equipo prefiere SHA-256 para consistencia con `git`/integridad.]


