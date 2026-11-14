# Implementation Plan: Logros y Constelación Visual

**Branch**: `008-logros-constelacion` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/memory/features/008-logros-constelacion/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Sistema de logros de PetAI con progresión visual en constelación. 5 categorías (Cuidado/Care, Batalla/Battle, IA, Colección/Collection, Social) con ~50-75 logros. Cada logro es una estrella que se ilumina; el progreso se trackea de forma data-driven desde `achievements.json`/`constellations.json` a partir de eventos de dominio (mismo mecanismo que las misiones, Feature #1). Al alcanzar el objetivo, el logro se desbloquea de forma atómica, acredita su recompensa (monedas/gemas, o item exclusivo para epic/legendary) y emite `achievement:unlocked` por WebSocket. El usuario puede activar la visibilidad pública de sus logros y exportar su constelación como imagen.

**Enfoque técnico**:
- Módulo NestJS `achievements/` con 4 servicios (`AchievementsService` orquestación/lectura, `AchievementTrackingService` eventos→progreso/desbloqueo, `ConstellationService` layout SVG, `AchievementRewardsService` acreditación atómica) y 1 controller REST (+ endpoint público en `users`).
- Modelo Prisma `Achievement` (`@@unique([userId, id])`) + campos nuevos en `User` (`achievements Public`, `achievementsPublic`).
- Redis para contadores en caliente (`ach:progress:{userId}:{achId}`, flush ~30s) con fallback a PostgreSQL.
- Eventos de dominio vía `@nestjs/event-emitter` → `AchievementTrackingService` (no bloquea la acción principal).
- WebSocket `achievement:unlocked` vía `RealtimeGateway.emitToUser()`.
- Recompensas con transacción atómica (`updateMany` + condición sobre `unlockedAt`) para evitar duplicación bajo race condition.
- Logros y layout data-driven en `shared/game-data/` (`achievements.json`, `constellations.json`) con validación zod e integridad cruzada en `GameDataService`.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS

**Primary Dependencies**: NestJS 11, Prisma ORM 6.4, ioredis 5.11, @nestjs/schedule, @nestjs/event-emitter, @nestjs/jwt, passport-jwt, socket.io 4.8, @nestjs/swagger

**Storage**: PostgreSQL 18 (vía Prisma ORM), Redis 8 (ioredis, tolerante a fallos con fallback a PG)

**Testing**: Jest (unitarios `.spec.ts` junto al código), Supertest (E2E en `backend/test/`)

**Target Platform**: Linux server (Docker) — `docker-compose.yml` con Postgres + Redis; frontend Tauri 2 + Svelte 5

**Project Type**: web-service (REST + WebSocket API autoritativo) + frontend desktop (Svelte)

**Performance Goals**: <100ms p95 para `GET /achievements` y `GET /achievements/constellation/{cat}` (SC-001 < 2s total); <2s para `achievement:unlocked` en la UI (SC-002)

**Constraints**:
- Backend es autoritativo: toda acreditación de recompensa y desbloqueo se resuelve en el servidor; `userId` siempre desde `@CurrentUser` (JWT), nunca de un parámetro.
- Transacciones atómicas (`updateMany` + condición sobre `unlockedAt`) para el desbloqueo: dos eventos concurrentes no duplican la recompensa.
- El listener de eventos NO bloquea la acción principal (se procesa asíncronamente vía `@OnEvent`, igual que `MissionTrackingService`).
- Redis es un acelerante, no un requisito: si falla, se recurre a PostgreSQL.
- Los items exclusivos son cosméticos (sin poder de combate).
- Privacidad por defecto: `achievementsPublic` `false`; el perfil público solo expone logros `unlocked`.

**Scale/Scope**: 10k usuarios concurrentes; ~50-75 logros × N users → índice `(userId, id)` suficiente (ver riesgo del spec: "75 logros × N users"); Redis flush ~30s en lote.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Artículo | Requisito | Cumple | Evidencia |
|----------|-----------|--------|-----------|
| **I. Backend autoritativo** | Toda acreditación/desbloqueo en servidor; transacciones atómicas; `userId` desde sesión | ✅ | `AchievementRewardsService.unlockAndGrant()` usa `prisma.$transaction` con `updateMany` condicionado a `unlockedAt: null`; `userId` de `@CurrentUser`; ningún azar (logros son deterministas) |
| **II. Combate determinista** | No aplica directamente (los logros de battle solo consumen `battle:finished`) | ✅ | El tracking no introduce aleatoriedad ni modifica el motor de combate |
| **III. Contrato único** | Todo cambio de API vía `@nestjs/swagger` → `shared/openapi/openapi.json` | ✅ | `achievements.controller.ts` y endpoints públicos de `users` con `@Api*`; `pnpm export:openapi` regenera el contrato |
| **IV. Game-data data-driven** | Logros y layout en `shared/game-data/*.json` validados (zod) con integridad cruzada | ✅ | `achievements.json` + `constellations.json` añadidos al snapshot de `GameDataService`; validación de ids cruzados |
| **VIII. Seguridad** | `userId` nunca de parámetro; visibilidad pública opt-in; sin exponer progreso privado | ✅ | `@CurrentUser` en todos los endpoints; `achievementsPublic` gate en `GET /users/:id/achievements`; `PATCH /me` solo por dueño |

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/008-logros-constelacion/
├── spec.md              # Feature specification (hecho)
├── plan.md              # This file (Implementation Plan)
├── tasks.md             # Task list (Phase 2 output)
└── contracts/
    └── api-contract.md  # API REST + WebSocket contract
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.module.ts                       # [MOD] registrar AchievementsModule
│   ├── achievements/                       # [NUEVO] módulo de logros
│   │   ├── achievements.module.ts
│   │   ├── achievements.controller.ts      # GET /achievements, GET /achievements/constellation/{cat}
│   │   ├── achievements.service.ts         # lectura, estado, constelación, claim
│   │   ├── achievement-tracking.service.ts # @OnEvent eventos → progreso → desbloqueo
│   │   ├── achievement-rewards.service.ts  # acreditación atómica (coins/gems/item)
│   │   ├── constellation.service.ts        # layout x,y + connections + status por categoría
│   │   └── dto/
│   │       └── achievement.dto.ts          # DTOs de respuesta para Swagger
│   └── modules/
│       ├── users/users.controller.ts       # [MOD] GET /users/:id/achievements?public=true
│       ├── users/users.service.ts          # [MOD] lógica de perfil público
│       └── game-data/game-data.schemas.ts  # [MOD] schemas + integridad para achievements/constellations
└── prisma/
    ├── schema.prisma                        # [MOD] model Achievement + campos en User
    └── migrations/                          # [NUEVO] migración 2026XXXX_achieve
shared/
├── game-data/
│   ├── achievements.json                    # [NUEVO] definiciones de logros
│   └── constellations.json                  # [NUEVO] layout x,y + connections por categoría
└── openapi/openapi.json                     # [REGEN] pnpm export:openapi
desktop/
└── src/
    └── features/achievements/               # [NUEVO] UI de logros/constelación
        ├── ConstellationView.svelte         # SVG: estrellas gray→yellow→bright + líneas
        ├── AchievementList.svelte           # lista filtrable por categoría
        ├── AchievementToast.svelte          # animación + reward al desbloquearse
        ├── achievements.api.ts              # cliente openapi-fetch + socket listener
        └── exportPng.ts                     # export PNG de la constelación
```

**Structure Decision**: Se sigue el patrón del monorepo pnpm ya establecido. Backend: nuevo módulo `backend/src/achievements/` (misma estructura que `backend/src/missions/`), registrado en `AppModule`. El endpoint de perfil público se añade al `UsersModule` existente (ya gestiona `GET/PATCH /me`). Los datos de logros y layout viven en `shared/game-data/` (data-driven, hot-reload). Frontend desktop: nuevo `desktop/src/features/achievements/` consumiendo el contrato OpenAPI.

## Arquitectura del módulo (pasos de implementación)

### Paso 1: Modelo de datos + game-data

**`backend/prisma/schema.prisma`** — [MOD]
- Añadir `model Achievement { id, userId, user, current @default(0), unlockedAt DateTime?, claimed @default(false), createdAt @default(now()), @@unique([userId, id]) }`.
- En `model User`: añadir `achievements Achievement[]` y `achievementsPublic Boolean @default(false)`.
- Migración: `pnpm prisma migrate dev --name add_achievements`.

**`shared/game-data/achievements.json`** — [NUEVO] — `{ version, achievements: [{ id, name, desc, category, target, event, tier, reward: { coins, gems, xp, itemId? } }] }` (~50-75 entradas, 5 categorías).

**`shared/game-data/constellations.json`** — [NUEVO] — `{ version, categories: { care: { name, stars: { <achId>: { x, y } }, connections: [[id,id],...] }, battle: {...}, ai: {...}, collection: {...}, social: {...} } }` (coordenadas normalizadas [0,1]).

**`backend/src/modules/game-data/game-data.schemas.ts`** — [MOD] — Añadir schemas zod para `achievements` y `constellations`, accesores `getAchievements()`/`getConstellations()` en `GameDataService`, y validación de integridad cruzada (todo `id` en `constellations` debe existir en `achievements`; `category` de cada logro debe tener constelación).

### Paso 2: Servicios del módulo

- **`achievement-tracking.service.ts`** — [NUEVO] — `@OnEvent` por cada evento de dominio (mismo set que `MissionTrackingService`). Por evento: (1) incrementa `current` de todos los logros activos `unlockedAt: null` cuyo `event` matchea (condicional `current < target`), (2) al alcanzar `target` delega en `AchievementRewardsService.unlockAndGrant()`, (3) emite `achievement:unlocked` vía `RealtimeGateway.emitToUser()`. Counter en caliente en Redis (`ach:progress:{userId}:{achId}`) con flush ~30s y fallback PG.
- **`achievement-rewards.service.ts`** — [NUEVO] — `unlockAndGrant(userId, achId)` dentro de `prisma.$transaction`: `updateMany` de `Achievement` condicionado a `{ userId, id, unlockedAt: null }`; si `count === 0` → ya desbloqueado (no-op); si `count === 1` → acrecentar `User.coins/gems/accountXp` y, si `reward.itemId`, insertar `InventoryItem` (idempotente).
- **`constellation.service.ts`** — [NUEVO] — `getConstellation(cat)` → `{ category, stars: [{ id, x, y, status, name, tier }], connections }` (estado de cada estrella a partir del `Achievement` del usuario + layout de `constellations.json`). Valida `cat`.
- **`achievements.service.ts`** — [NUEVO] — `getAll(userId)` (estado `locked|in_progress|unlocked` por logro), `claim(userId, achId)` (reclamo atómico con `claimed`), `getPublicAchievements(userId)`.

### Paso 3: Controller REST + endpoints públicos

**`backend/src/achievements/achievements.controller.ts`** — [NUEVO]
- `@Controller('achievements')` con `@UseGuards(JwtAuthGuard)`.
- `GET /` → `achievementsService.getAll(@CurrentUser().id)`
- `GET /constellation/:cat` → `constellationService.getConstellation(@CurrentUser().id, :cat)`
- `POST /:id/claim` → `achievementsService.claim(@CurrentUser().id, :id)`

**`backend/src/modules/users/users.controller.ts`** — [MOD]
- `GET /users/:id/achievements` (query `?public=true`) → lógica de perfil público (solo `unlocked` si `achievementsPublic`).

**`backend/src/achievements/dto/achievement.dto.ts`** — [NUEVO] — `AchievementDto`, `AchievementListResponseDto`, `ConstellationResponseDto`, `StarDto`, `ClaimRewardResponseDto`, `PublicAchievementsDto`.

### Paso 4: Módulo + registro

- **`achievements.module.ts`** — [NUEVO] — imports `[PrismaModule, RedisModule, GameDataModule, RealtimeModule, InventoryModule]`, providers `[AchievementsService, AchievementTrackingService, AchievementRewardsService, ConstellationService]`, controller `[AchievementsController]`, exports `[AchievementsService, ConstellationService]`.
- **`backend/src/app.module.ts`** — [MOD] — registrar `AchievementsModule`.

### Paso 5: Tests

- `achievements.service.spec.ts`: estado, claim, public (race).
- `achievement-tracking.service.spec.ts`: mapeo evento→logro, over-count, multi-logro por evento, emit WS.
- `achievement-rewards.service.spec.ts`: desbloqueo atómico, item idempotente, race condition.
- `constellation.service.spec.ts`: layout, categoría inválida (400), status coherente.
- `achievements.controller.spec.ts`: 401 sin token, 200, routing.
- E2E: `backend/test/achievements.e2e-spec.ts` — registro → pet → feed → progreso → unlock → WS `achievement:unlocked` → reward → claim → `PATCH /me` → perfil público.

### Paso 6: Frontend desktop + export

**`desktop/src/features/achievements/`** — [NUEVO] — `ConstellationView.svelte` (SVG: estrella por logro, color `gray|yellow|bright` por `status`, líneas de `connections`), `AchievementList.svelte` (filtro por categoría), `AchievementToast.svelte` (animación + reward al recibir `achievement:unlocked`), `achievements.api.ts` (openapi-fetch + listener socket.io), `exportPng.ts` (rasteriza el SVG a PNG con el nombre del jugador).

### Paso 7: Exportar OpenAPI

`pnpm export:openapi` → `shared/openapi/openapi.json` con endpoints de logros + perfil público.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Sin violaciones. No se requiere justificación.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Riesgos y decisiones

| # | Decisión | Alternativa descartada | Razón |
|---|----------|------------------------|-------|
| 1 | Reutilizar el mecanismo de eventos de dominio de misiones (`@OnEvent` + `@nestjs/event-emitter`) | Sistema de colas dedicado para logros | Los eventos ya existen y son el patrón establecido; añadir colas es infraestructura innecesaria (YAGNI). Coherencia con Feature #1. |
| 2 | Desbloqueo con `updateMany` + condición `unlockedAt: null` (transacción) | `findFirst` + `update` | Race condition: dos eventos concurrentes duplicarían la recompensa. La condición atómica garantiza idempotencia (Constitución I). |
| 3 | Logros y layout data-driven (`achievements.json`/`constellations.json`) | Logros hard-coded en el código | Permite añadir/tuning de logros sin tocar código y sin deploy; hot-reload ya soportado por `GameDataService` (Constitución IV). |
| 4 | Progreso por USUARIO (no por pet) | Progreso por pet | Coherente con misiones; evita fragmentar logros con multi-pet; los logros condicionados a rareza/etapa usan el payload del evento. |
| 5 | Item exclusivo vía `InventoryModule` (idempotente) | Item generado ad-hoc en el logro | Reutiliza el inventario existente y garantiza no duplicar el item si el desbloqueo se re-dispara (SC-004). |
| 6 | Export PNG en el cliente (desktop) | Endpoint backend que genera la imagen | La constelación ya está renderizada en SVG en el cliente; rasterizarla es trivial y evita un endpoint pesado (SC-007). |

## Notas para implementar

- El modelo `Achievement` **NO existe** en `schema.prisma`; requiere creación + migración. El modelo `Mission` sí existe y sirve de referencia de índices.
- `achievements.json` y `constellations.json` **NO existen**; se crean en `shared/game-data/` y se integran en `GameDataService` (snapshot, schema zod, integridad cruzada, hot-reload).
- `RedisService` es `@Global()`; se inyecta directamente. `RealtimeGateway` es global (en `RealtimeModule`); se inyecta directamente con `emitToUser()`.
- `@nestjs/event-emitter` y `@nestjs/schedule` ya están registrados en `AppModule` (`EventEmitterModule.forRoot()`, `ScheduleModule.forRoot()`).
- El listener de eventos de `AchievementTrackingService` NO debe bloquear la acción principal (mismo patrón que `MissionTrackingService`).
- El campo `claimed` permite distinguir "desbloqueado" (`unlockedAt`) de "recompensa reclamada" (`claimed`); el desbloqueo otorga el reward automáticamente, el `claim` expone el estado.
- Verificar que `InventoryModule` expose un método idempotente para insertar un item por `itemId`; si no, añadir `grantExclusiveItem(userId, itemId)` con `@@unique`/comprobación previa.
- Los eventos `pet:level_up` (usado también por misiones) debe emitirse por `pets.service.ts`; los logros lo consumen sin emitirlo.
- La categoría `social` puede requerir un evento propio (p. ej. `social:constellation_shared`) o quedar stub (ver pregunta abierta #4 del spec).
- `pnpm export:openapi` debe correr tras añadir los DTOs para regenerar `shared/openapi/openapi.json`.