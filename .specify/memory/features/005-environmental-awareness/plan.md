# Implementation Plan: Environmental Awareness & Mood Weather

**Branch**: `005-environmental-awareness` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/memory/features/005-environmental-awareness/spec.md`

**Note**: Este plan se llena según el workflow `/speckit-plan`; su definición describe el proceso de ejecución.

## Summary

Hacer que el pet "viva" en el mundo del usuario: el backend resuelve el **estado ambiental** (hora del día por `timezone`, clima real vía **Open-Meteo** con cache en Redis por coordenadas y fallback, actividad por heartbeat de escritorio, y festividad) y lo expone con `GET /environmental/status`. El clima incide en los vitales del pet **dentro del lazy tick existente** (principio IV), el contexto ambiental se inyecta en el **prompt de la IA**, y el escritorio consume el contrato (overlay de accesorios, heartbeat cada 60 s y animaciones) a partir de tipos generados del `openapi.json`. Sin cron por usuario y sin colas nuevas: todo es efímero en Redis y derivado de timestamps.

## Technical Context

**Language/Version**: TypeScript 5.7, Node 24 LTS (backend); Rust edition 2021 + Svelte 5 + Vite 6 (escritorio Tauri 2).

**Primary Dependencies**: `@nestjs/common|core|config|websockets|swagger` (NestJS 11), `ioredis` vía `RedisService`, Prisma ORM, `@nestjs/passport` + `@nestjs/jwt`, `openapi-fetch` + `socket.io-client` (escritorio). No se añade ninguna dependencia nueva (Open-Meteo se consume por `fetch` estándar con guardas SSRF existentes).

**Storage**: PostgreSQL (Prisma) para `User.latitude/longitude/birthday`; Redis (ioredis) para el estado ambiental efímero (`weather:{lat}:{lon}` TTL 30 min, `activity:{userId}` TTL 3 h).

**Testing**: Jest unitarios (`.spec.ts` junto al código) para las funciones puras (mapeo WMO→condición, `timeOfDay`, umbral de inactivity, lookup de festividad, modificadores de vitales, prompt IA); E2E con Supertest en `backend/test/*.e2e-spec.ts` contra Postgres/Redis de `docker-compose`.

**Target Platform**: Servidor Linux (backend autoritativo) + escritorio Tauri (primer cliente real). Android/iOS son consumidores posteriores del mismo contrato.

**Project Type**: Web service (NestJS) + desktop app (Tauri/Svelte) en monorepo pnpm.

**Performance Goals**: `GET /environmental/status` < 500 ms p95 con cache caliente; timeout de la llamada a Open-Meteo de 3 s; heartbeat `POST /environmental/activity` < 100 ms.

**Constraints**: Sin cron por usuario/pet; cache 30 min por coordenada; degradación elegante (API caída → `unknown`); coordenadas opt-in (privacidad); sin literales hardcodeados (todo en `balance.json → environmental`); contrato único vía `@nestjs/swagger` → `openapi.json`.

**Scale/Scope**: ~200 usuarios; 1 módulo NestJS nuevo + 1 migración + 2 ediciones de datos de juego + overlay/heartbeat en escritorio. Sin modelo Prisma nuevo.
## Constitution Check

*GATE: debe pasar antes de la investigación de Phase 0. Re-verificar tras el diseño de Phase 1.*

| # | Principio | Estado | Cumplimiento en este plan |
|---|-----------|--------|---------------------------|
| I | Backend autoritativo | ✅ PASS | `timeOfDay`/`weather`/`activity`/`festival` se resuelven **en el servidor**; `userId` sale de `@CurrentUser` (JWT), jamás del cliente; el heartbeat no altera estado de juego, solo registra última actividad. Sin azar de cliente. |
| II | Combate determinista | ✅ N/A | No hay combate. Aun así, la lógica de mapeo (WMO→condición) y `timeOfDay` son **funciones puras** testeables, consistentes con el espíritu de determinismo. |
| III | Consistencia multi-plataforma | ✅ PASS | Los 3 endpoints se documentan con `@nestjs/swagger` y se regeneran `shared/openapi/openapi.json`; el escritorio consume tipos generados (`openapi-fetch`), no tipos a mano. `festivals.json` vive en `shared/game-data`. |
| IV | Lazy Tick | ✅ PASS | El clima modifica los vitales **dentro de `applyLazyTick`** (hooks sobre `elapsedHours`), no con un cron por pet. La única fuente de avance del tiempo sigue siendo `lastTickAt`. |
| V | Tiempo real WS autenticado | ✅ PASS | `environmental:changed` se emite vía `RealtimeGateway.emitToUser(userId, ...)` a la sala `user:<id>`; la identidad sale solo del JWT del handshake. |
| VI | Arquitectura modular por dominio | ✅ PASS | Nuevo dominio `modules/environmental/` (controller + `weather.service`, `activity-tracker.service`, `festival.service`, mapeadores puros), registrado en `AppModule`; inyecta `PrismaService`, `RedisService`, `GameDataService`, `RealtimeGateway`. |
| VII | Datos de juego por balance.json | ✅ PASS | Umbrales (`hot_temp`, `cold_temp`), tasas (`hunger_hot`, `happiness_rain`, `energy_snow`) y `inactivityThresholdHours` se leen de `balance.json → environmental` vía `gameData.getBalance()`; se versiona el JSON. `festivals.json` nuevo en `shared/game-data`. |
| VIII | Seguridad | ✅ PASS | Coordenadas opt-in; el fetch de meteo pasa por allowlist SSRF (`open-meteo.com`, solo http/https); `POST /activity` bajo rate limiting por usuario/IP; `userId` de sesión. |
| IX | Simplicidad primero | ✅ PASS | Sin cron por usuario, sin cola BullMQ nueva (la limpieza de `activity:` se resuelve con TTL de Redis); un módulo + 1 migración + 2 JSON; YAGNI. |

**Veredicto GATE**: PASS sin violaciones. No se requiere sección de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/005-environmental-awareness/
├── spec.md              # Especificación (user stories P1/P2/P3, FR-*, SC-*)
├── plan.md              # Este archivo (output de /speckit-plan)
├── data-model.md        # Phase 1: modelo de datos (User + Redis + JSON) — opcional
├── quickstart.md        # Phase 1: validación ponta-a-punta — opcional
├── contracts/
│   └── api-contract.md  # Phase 1: contrato REST + WebSocket + Redis
└── tasks.md             # Phase 2: output de /speckit-tasks
```

### Source Code (repository root)

```text
backend/src/modules/environmental/          # NUEVO módulo de dominio
├── environmental.module.ts                # Declara controller + services; exporta EnvironmentalService
├── environmental.controller.ts            # GET /environmental/status, POST /activity, GET /festivals/upcoming
├── environmental.service.ts               # Compone { timeOfDay, weather, activity, festival }; orquesta WS
├── weather.service.ts                     # Fetch Open-Meteo + cache Redis (30 min) + fallback; SSRF-safe
├── weather.mapper.ts                      # PURO: weather_code (WMO) + temp → condition (unit-testable, sin Nest)
├── time-of-day.ts                         # PURO: (Date, timeZone) → timeOfDay (unit-testable)
├── activity-tracker.service.ts            # Heartbeat en Redis (TTL 3h) + umbral → "active" | "solo"
├── festival.service.ts                    # Lookup por fecha+región desde festivals.json (GameDataService)
├── environmental.types.ts                 # DTOs: EnvironmentalStatus, WeatherInfo, ActivityInfo, FestivalInfo
└── *.spec.ts                              # Tests unitarios de cada servicio + mapeadores puros

backend/src/modules/environmental/env-constants.ts   # allowlist de host Open-Meteo, TTLs, timeouts (referencia)

backend/src/app.module.ts                          # REGISTRAR EnvironmentalModule
backend/src/modules/pets/pets.service.ts           # HOOK: modificadores ambientales dentro de applyLazyTick
backend/src/modules/pets/pets.service.spec.ts      # Test de modificadores en el lazy tick
backend/src/modules/ai/personality.ts              # buildSystemPrompt(): acepta contexto ambiental opcional
backend/src/modules/ai/personality.spec.ts         # Test: el prompt incluye el bloque de contexto
backend/src/modules/ai/chat.service.ts             # buildContext(): obtiene status y lo pasa al prompt
backend/src/modules/users/users.controller.ts      # PATCH /me: aceptar latitude/longitude (opt-in) [según convención users]

backend/prisma/schema.prisma                       # User + latitude, longitude, birthday
backend/prisma/migrations/xxxx_add_user_env_fields/  # Migración correspondiente

shared/game-data/balance.json                      # SECCIÓN NUEVA: "environmental" (umbrales + tasas + umbral inactivity)
shared/game-data/festivals.json                    # NUEVO: lista de festividades
shared/game-data/game-data.schema.json             # (si existe) añadir referencias a balance.environmental / festivals
shared/openapi/openapi.json                        # REGENERAR tras documentar los endpoints (pnpm export:openapi)

desktop/src/lib/environmental.ts                   # NUEVO: cliente de heartbeat (POST cada 60 s) + fetch de status
desktop/src/components/EnvironmentalOverlay.svelte # NUEVO: accesorios (paraguas, gorro) sobre el pet
desktop/src/components/PetView.svelte              # Aceptar props de overlay + variantes por timeOfDay/weather
desktop/src/App.svelte                             # Geolocalización opt-in, arrancar heartbeat, WS environmental:changed, overlay
```

**Structure Decision**: Se añade un único módulo de dominio (`environmental`) siguiendo la convención `backend/src/modules/<dominio>/` (principio VI), que inyecta los recursos compartidos existentes (`PrismaService`, `RedisService`, `GameDataService`, `RealtimeGateway`) y se registra en `AppModule`. El estado ambiental es **efímero en Redis** (sin modelo Prisma nuevo), los números ajustables viven en `shared/game-data` (principio VII) y el escritorio consume el contrato regenerado (principio III). No se añade un segundo proyecto ni una cola: se respeta YAGNI (principio IX).

## Complexity Tracking

> **Rellenar SOLO si el Constitution Check tiene violaciones que justificar.**

Ninguna. Todos los principios pasan (ver tabla de Constitution Check). No se requieren violaciones.

