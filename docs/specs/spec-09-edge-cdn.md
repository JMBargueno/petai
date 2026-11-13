# Spec: Edge Computing + CDN + Predictive Preloading

## ID
Feature #9 — Oleada 1 "Performance y latencia"

## Resumen
Delivery de assets (sprites SVG, JSON) vía CDN con versioning por hash, edge function para auth refresh (<50ms), y predictive preloading (evolución inminente → sprites nueva etapa precargadas).

## Contexto
El desktop carga sprites y game-data del backend. Al escalar, cada request consume recursos. Un CDN reduce carga del backend y latencia. Edge functions para auth reducen time-to-login. Predictive preloading elimina "pop-in" al evolucionar.

Conecta con: `shared/game-data/`, sprites SVG, auth (`/auth/refresh`), evolución.

## Objetivos
- Assets en < 200ms global.
- Auth refresh < 50ms desde edge.
- Sin "pop-in" de sprites al evolucionar.
- Backend solo para auth (register/login) y lógica.

## User Stories
- Como jugador, quiero sprites que carguen instantáneamente.
- Como jugador, quiero que al evolucionar no haya pausa de "cargando".
- Como jugador, quiero login instantáneo al reabrir.
- Como devops, quiero ver métricas de CDN por región.

## Criterios de aceptación
- [ ] AC1: Assets en CDN con versioning por hash (`sprite-ignisaur-a3b2f1.svg`).
- [ ] AC2: Manifest (`/assets/manifest.json`) con cache 1h.
- [ ] AC3: `POST /v1/auth/refresh` en edge, p95 < 50ms.
- [ ] AC4: Pre-carga sprites próxima etapa si nivel ≥ 9/24/49.
- [ ] AC5: Evento en < 2h → pre-carga assets del evento.
- [ ] AC6: CDN fallback → origin si 404.
- [ ] AC7: Game-data JSON en CDN, cache in-memory al iniciar.

## Diseño técnico
### Infraestructura
- **CDN:** Cloudflare R2/Pages. `Cache-Control: immutable` (hash) / `max-age=86400` (manifest)
- **Edge function:** `POST /auth/refresh` → valida JWT → rota token (Redis edge) → nuevo token. Fallback origin.
- **Build:** `build:assets` → hash MD5 → upload CDN → update manifest.

### Backend
- `GET /assets/manifest` → JSON de paths versionados
- `POST /auth/refresh` → se mueve a edge (origin solo register/login)
- `GET /events/upcoming` → eventos en 24h (para preloading)

### Frontend
- **AssetLoader:** fetch manifest → Map cache → `loadAsset(key)` → CDN
- **Predictive:** nivel ≥ 9 → sprites juvenile, ≥ 24 → adult, ≥ 49 → final
- **Preloading:** request priority `low`, background, no bloquea UI
- **Auth:** refresh a edge URL, fallback origin

## Interfaz de API
- `GET /assets/manifest` → `{ version, assets: { key: { url, hash } } }`
- `POST /v1/auth/refresh` (EDGE) → `{ accessToken, refreshToken, user }`
- `GET /events/upcoming` → `{ events: [{ id, name, startsAt, assetPrefix }] }`

## Modelo de datos
- Sin cambios en Prisma. Assets son files, no DB records.

## Eventos y sincronización
- Sin WS events nuevos.
- Preloading activado por eventos locales (nivel, evento próximo).

## Dependencias
- CDN (Cloudflare/Vercel), Tauri HTTP, Auth existente, build pipeline, Feature #5 (events)

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Build pipeline (hash + upload + manifest) | 1.5 días |
| 2 | AssetLoader frontend | 1.5 días |
| 3 | Predictive preloading | 1 día |
| 4 | Edge function auth | 1.5 días |
| 5 | Events endpoint + integration | 1 día |
| 6 | Tests CDN + docs | 1 día |

**Total: ~7.5 días**

## Tests
- Unit: manifest, hash, AssetLoader cache
- Integration: 404 → fallback, edge refresh → válido
- E2E: deploy sprite → manifest → cliente carga
- Edge: CDN down, token expirado, 100 preloads

## Riesgos y notas
- **Coste:** Cloudflare free (100GB, 10M req/mes) OK para v1.
- **Cache:** Versioning por hash = no invalidation.
- **Edge auth:** Sin Redis edge → fallback origin.
- **Tauri:** Migrar de embebido a CDN + cache local `~/.petai/assets/`.

## Preguntas abiertas
1. Cloudflare vs Vercel? (Propuesta: Cloudflare.)
2. Assets embebidos actualmente? (Propuesta: SÍ → migrar a CDN + cache.)
3. Edge con Redis o solo JWT? (Propuesta: v1 JWT solo, v2 Redis edge.)
4. Pre-cargar todas las especies? (Propuesta: solo actual + próximas etapas.)