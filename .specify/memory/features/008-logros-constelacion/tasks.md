---
description: "Task list for feature 008-logros-constelacion implementation"
---

# Tasks: Logros y Constelación Visual

**Input**: Design documents from `.specify/memory/features/008-logros-constelacion/`

**Prerequisites**: plan.md ✅, spec.md ✅, contracts/api-contract.md ✅

**Tests**: Tests unitarios (`.spec.ts`) incluidos (Paso 5 del plan). Tests E2E en `backend/test/`.

**Organization**: Tareas agrupadas por user story para implementación independiente.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: Puede ejecutarse en paralelo (archivos diferentes, sin dependencias)
- **[Story]**: A qué user story pertenece (US1..US6)
- Incluyen ruta exacta de archivo en la descripción

## Path Conventions

- **Backend (NestJS)**: `backend/src/`
- **Tests unitarios**: `backend/src/achievements/*.spec.ts` (junto al código)
- **Tests E2E**: `backend/test/`
- **Prisma**: `backend/prisma/`
- **Shared config**: `shared/game-data/`
- **OpenAPI**: `shared/openapi/`
- **Frontend desktop**: `desktop/src/features/achievements/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Datos data-driven y verificación de infraestructura existente

- [ ] T001 Crear `shared/game-data/achievements.json` [NUEVO] con las definiciones de logros `{ version, achievements: [{ id, name, desc, category, target, event, tier, reward }] }` (~50-75 entradas, 5 categorías: care, battle, ai, collection, social)
  - Depende de: nada
  - **Nota**: base de todos los logros; `category` y `event` referencian los sistemas existentes
- [ ] T002 [P] Crear `shared/game-data/constellations.json` [NUEVO] con el layout `{ version, categories: { care: { name, stars: { <achId>: { x, y } }, connections: [[id,id]] }, ... } }` (coordenadas normalizadas [0,1])
  - Depende de: T001 (los `achId` deben existir en `achievements.json`)
- [ ] T003 [P] Verificar que `@nestjs/event-emitter` y `@nestjs/schedule` están en `backend/package.json` y registrados en `AppModule` (`EventEmitterModule.forRoot()`, `ScheduleModule.forRoot()`)
  - Depende de: nada
  - **Archivo**: `backend/package.json`, `backend/src/app.module.ts` (ya registrados — solo verificar)

**Checkpoint**: game-data de logros creado y validado, infraestructura de eventos/escala confirmada

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Modelo de datos + esqueleto del módulo que BLOQUEA todas las user stories

**⚠️ CRÍTICO**: Ninguna user story puede implementarse hasta completar esta fase

- [ ] T004 Crear `model Achievement` en `backend/prisma/schema.prisma` [MOD] (`id`, `userId`, `user`, `current @default(0)`, `unlockedAt DateTime?`, `claimed @default(false)`, `createdAt`, `@@unique([userId, id])`) y añadir en `model User` la relación `achievements Achievement[]` y `achievementsPublic Boolean @default(false)`; correr `pnpm prisma migrate dev --name add_achievements`
  - Depende de: nada
- [ ] T005 Añadir schemas zod para `achievements` y `constellations` en `backend/src/modules/game-data/game-data.schemas.ts` [MOD], accesores `getAchievements()`/`getConstellations()` en `GameDataService`, e integridad cruzada (ids de `constellations` ⊆ `achievements`)
  - Depende de: T001, T002
- [ ] T006 [P] Crear `backend/src/achievements/achievements.module.ts` [NUEVO] (`imports: [PrismaModule, RedisModule, GameDataModule, RealtimeModule, InventoryModule]`, `providers: [AchievementsService, AchievementTrackingService, AchievementRewardsService, ConstellationService]`, `controllers: [AchievementsController]`, `exports: [AchievementsService, ConstellationService]`)
  - Depende de: T004
- [ ] T007 [P] Crear `backend/src/achievements/dto/achievement.dto.ts` [NUEVO] con `AchievementDto`, `AchievementListResponseDto`, `ConstellationResponseDto`, `StarDto`, `ClaimRewardResponseDto`, `PublicAchievementsDto`
  - Depende de: nada
- [ ] T008 Registrar `AchievementsModule` en `backend/src/app.module.ts` [MOD] (añadir a `imports[]`)
  - Depende de: T006

**Checkpoint**: Modelo persistido, game-data cargable, módulo registrado — las user stories pueden empezar

---

## Phase 3: User Story 1 - Panel de logros y estado (Priority: P1) 🎯 MVP

**Goal**: `GET /achievements` devuelve todos los logros con `status` (locked/in_progress/unlocked)

**Independent Test**: Llamar `GET /achievements` con Bearer token y verificar `200` con logros y estados coherentes

### Tests for User Story 1

> **NOTE: Escribir estos tests PRIMERO y asegurar que FAILAN antes de implementar**

- [ ] T009 [P] [US1] Test unitario del controller: `GET /achievements` 200/401/routing en `backend/src/achievements/achievements.controller.spec.ts`
- [ ] T010 [P] [US1] Test unitario del service: `getAll()` estado locked/in_progress/unlocked, logros ausentes (lazy) en `backend/src/achievements/achievements.service.spec.ts`

### Implementation for User Story 1

- [ ] T011 [US1] Implementar `backend/src/achievements/achievements.service.ts` [NUEVO] → `getAll(userId)`: cruza `GameDataService.getAchievements()` con las filas `Achievement` del usuario y calcula `status`
- [ ] T012 [US1] Implementar `backend/src/achievements/achievements.controller.ts` [NUEVO] → `@Controller('achievements')` con `@UseGuards(JwtAuthGuard)`, `GET /` → `getAll(@CurrentUser().id)` (con DTOs de Swagger)
- [ ] T013 [US1] Lazy-init: al no existir filas `Achievement` para el usuario, derivar estado solo desde `achievements.json` (sin insertar rows innecesarias)
  - **Nota**: MVP listo — `GET /achievements` funciona de forma independiente

**Checkpoint**: Validar `GET /achievements` de forma independiente (MVP)

---

## Phase 4: User Story 2 - Progreso por eventos de dominio (Priority: P2)

**Goal**: Los eventos de dominio incrementan `current` de los logros activos

**Independent Test**: Disparar `pet:fed` y verificar que `current` de los logros de `event: "pet:fed"` incrementa

### Tests for User Story 2

- [ ] T014 [P] [US2] Test unitario del tracking: mapeo evento→logro, over-count, multi-logro por evento, emit WS en `backend/src/achievements/achievement-tracking.service.spec.ts`

### Implementation for User Story 2

- [ ] T015 [US2] Implementar `backend/src/achievements/achievement-tracking.service.ts` [NUEVO] → `@OnEvent` por cada evento (`pet:fed`, `pet:cleaned`, `pet:slept`, `pet:evolved`, `egg:hatched`, `battle:finished`, `minigame:finished`, `chat:message_sent`, `pet:level_up`); incrementa `current` solo si `unlockedAt: null` y `current < target`; counter en caliente en Redis (`ach:progress:{userId}:{achId}`) con flush ~30s y fallback PG
- [ ] T016 [US2] Conectar el tracking con la detección de `target` alcanzado (delegar al `AchievementRewardsService` — ver US3) y al emit de WS

**Checkpoint**: Un evento de dominio incrementa el progreso de los logros correctos

---

## Phase 5: User Story 3 - Desbloqueo + recompensa + WS (Priority: P2)

**Goal**: Al alcanzar `target`, desbloquear de forma atómica, acreditar reward (monedas/gemas/item) y emitir `achievement:unlocked`

**Independent Test**: Forzar un logro a `target` y verificar `unlockedAt`, reward acreditado (sin duplicar) y WS emitido

### Tests for User Story 3

- [ ] T017 [P] [US3] Test unitario de rewards: desbloqueo atómico, item idempotente, race condition (2 eventos concurrentes) en `backend/src/achievements/achievement-rewards.service.spec.ts`

### Implementation for User Story 3

- [ ] T018 [US3] Implementar `backend/src/achievements/achievement-rewards.service.ts` [NUEVO] → `unlockAndGrant(userId, achId)` en `prisma.$transaction`: `updateMany` condicionado a `{ userId, id, unlockedAt: null }`; si `count === 1` acrecentar `User.coins/gems/accountXp` y, si `reward.itemId`, insertar `InventoryItem` idempotente
- [ ] T019 [US3] Añadir método idempotente en `InventoryModule` (p. ej. `grantExclusiveItem(userId, itemId)`) si no existe; items cosméticos (sin poder)
- [ ] T020 [US3] Emitir `achievement:unlocked { id, name, category, tier, reward }` vía `RealtimeGateway.emitToUser()` al desbloquear
- [ ] T021 [US3] Completar `claim(userId, achId)` en `achievements.service.ts` (estado `claimed`) + `POST /achievements/:id/claim` en el controller

**Checkpoint**: Un desbloqueo acredita reward exactamente una vez y notifica por WS

---

## Phase 6: User Story 4 - Constelación por categoría (Priority: P3)

**Goal**: `GET /achievements/constellation/{cat}` devuelve `{ x, y, status, name }` + `connections` para el SVG

**Independent Test**: Llamar `GET /achievements/constellation/battle` y verificar estrellas con coordenadas y `status` coherente

### Tests for User Story 4

- [ ] T022 [P] [US4] Test unitario de constellation: layout, categoría inválida (400), status coherente en `backend/src/achievements/constellation.service.spec.ts`

### Implementation for User Story 4

- [ ] T023 [US4] Implementar `backend/src/achievements/constellation.service.ts` [NUEVO] → `getConstellation(userId, cat)`: lee layout de `constellations.json`, cruza `status` por logro, valida `cat` (sino `BadRequestException`)
- [ ] T024 [US4] Añadir `GET /constellation/:cat` en `achievements.controller.ts` (DTO `ConstellationResponseDto`)

**Checkpoint**: La constelación de una categoría se sirve con coordenadas y estado

---

## Phase 7: User Story 5 - Perfil público opt-in (Priority: P3)

**Goal**: `PATCH /me { achievementsPublic }` + `GET /users/:id/achievements?public=true` (solo `unlocked`)

**Independent Test**: `PATCH /me` y verificar `GET /users/:id/achievements` respeta `achievementsPublic`

### Tests for User Story 5

- [ ] T025 [P] [US5] Test unitario del perfil público: `achievementsPublic: false` no expone, `true` expone solo `unlocked` (sin `current`) en `backend/src/achievements/achievements.service.spec.ts` (extender)

### Implementation for User Story 5

- [ ] T026 [US5] Añadir `achievementsPublic` a `PATCH /me` en `backend/src/modules/users/users.controller.ts` + lógica en `users.service.ts` [MOD]
- [ ] T027 [US5] Añadir `getPublicAchievements(userId)` en `achievements.service.ts` (solo logros `unlocked`, sin `current`) [MOD]
- [ ] T028 [US5] Añadir endpoint `GET /users/:id/achievements` (query `?public=true`) en `users.controller.ts` [MOD] (reutiliza `AchievementsService`; exporta desde `AchievementsModule`)

**Checkpoint**: El perfil público respeta la privacidad por defecto y expone solo lo desbloqueado

---

## Phase 8: User Story 6 - Exportar constelación como imagen (Priority: P4)

**Goal**: Exportar la constelación a PNG desde el frontend (desktop)

**Independent Test**: Generar PNG desde `ConstellationView` y verificar que refleja las estrellas y el nombre, sin datos privados

### Implementation for User Story 6

- [ ] T029 [US6] Implementar `desktop/src/features/achievements/ConstellationView.svelte` [NUEVO] → SVG: estrella por logro, color `gray|yellow|bright` por `status`, líneas de `connections`
- [ ] T030 [P] [US6] Implementar `desktop/src/features/achievements/AchievementList.svelte` (filtro por categoría) + `AchievementToast.svelte` (animación + reward al `achievement:unlocked`) [NUEVO]
- [ ] T031 [P] [US6] Implementar `desktop/src/features/achievements/achievements.api.ts` [NUEVO] → cliente openapi-fetch + listener socket.io de `achievement:unlocked`
- [ ] T032 [US6] Implementar `desktop/src/features/achievements/exportPng.ts` [NUEVO] → rasteriza el SVG a PNG con el nombre del jugador (sin logros no desbloqueados)

**Checkpoint**: El usuario puede exportar su constelación como imagen

---

## Phase 9: Polish & Validation

**Purpose**: E2E, contrato OpenAPI y verificación final

- [ ] T033 [P] Test E2E completo en `backend/test/achievements.e2e-spec.ts` [NUEVO]: registro → pet → feed → progreso → unlock → WS `achievement:unlocked` → reward → claim → `PATCH /me` → perfil público
- [ ] T034 [P] Exportar OpenAPI: `pnpm export:openapi` → actualizar `shared/openapi/openapi.json` con endpoints de logros + perfil público
- [ ] T035 [P] Verificar integridad cruzada del hot-reload (ids de `constellations.json` ⊆ `achievements.json`) y validación zod de ambos game-data
- [ ] T036 Revisar cumplimiento de Constitución (I, III, IV, VIII) y SC-001..SC-007

**Checkpoint**: Todas las stories integradas, contrato regenerado, E2E en verde

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No depende de nada — puede empezar inmediatamente
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA todas las user stories
- **User Stories (Phase 3-8)**: Todas dependen de Foundational
  - US1, US2, US3 pueden avanzar en paralelo (archivos distintos) tras Phase 2
  - US4 depende de US1 (necesita `getAll`/estado)
  - US5 depende de US1 (perfil reutiliza `AchievementsService`)
  - US6 depende de US4 (necesita el layout/constelación)
- **Polish (Phase 9)**: Depende de todas las user stories deseadas

### User Story Dependencies

- **US1 (P1)**: Tras Phase 2 — sin dependencias de otras stories
- **US2 (P2)**: Tras Phase 2 — puede integrar con US3 pero testable de forma independiente
- **US3 (P2)**: Tras US2 (el tracking delega al rewards) — testable de forma independiente
- **US4 (P3)**: Tras US1 (estado) — testable de forma independiente
- **US5 (P3)**: Tras US1 (perfil) — testable de forma independiente
- **US6 (P4)**: Tras US4 (constelación) — testable de forma independiente

### Within Each User Story

- Tests escritos y FAIL antes de implementación
- Game-data/modelo antes que servicios; servicios antes que endpoints
- Núcleo antes que integración
- Story completa antes de pasar a la siguiente prioridad

### Parallel Opportunities

- **Phase 1**: T002, T003 en paralelo con T001
- **Phase 2**: T006, T007 en paralelo con T004/T005
- **US1**: T009, T010 (tests) en paralelo
- **US2/US3**: T014, T017 (tests) en paralelo con T015/T018
- **US4/US5**: T022, T025 (tests) en paralelo
- **US6**: T030, T031 en paralelo
- **Cross-story**: US1, US2 y US3 en paralelo con 3 devs tras Phase 2
- **Phase 9**: T033, T034, T035 en paralelo

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de US1 juntos:
Task: "Test unitario del controller: GET /achievements 200/401/routing en achievements.controller.spec.ts"
Task: "Test unitario del service: getAll() estado en achievements.service.spec.ts"

# Luego implementar en orden:
Task: "Implementar achievements.service.ts getAll() (cruza achievements.json + filas Achievement)"
Task: "Implementar achievements.controller.ts GET / con DTOs de Swagger"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001-T003)
2. Completar Phase 2: Foundational (T004-T008) — CRÍTICO, bloquea todo
3. Completar Phase 3: User Story 1 (T009-T013)
4. **PARAR Y VALIDAR**: Testear `GET /achievements` de forma independiente
5. Deploy/demo del MVP

### Incremental Delivery

1. Setup + Foundational → Fundación lista
2. US1 → Testear → Deploy/Demo (**MVP!**)
3. US2 → Testear → Deploy/Demo (progreso en tiempo real)
4. US3 → Testear → Deploy/Demo (desbloqueo + reward + WS)
5. US4 → Testear → Deploy/Demo (constelación visual)
6. US5 → Testear → Deploy/Demo (perfil público)
7. US6 → Testear → Deploy/Demo (export PNG)
8. Cada story agrega valor sin romper las anteriores

### Parallel Team Strategy

Con 3 developers:

1. **Todos juntos**: Setup + Foundational (Phase 1-2, ~1 día)
2. **Tras Phase 2**:
   - **Dev A**: US1 → US3 (MVP + progreso + rewards)
   - **Dev B**: US2 (tracking) y luego US4 (constelación)
   - **Dev C**: US5 (perfil público) y luego US6 (frontend/export)
3. **Todos juntos**: Phase 9 (Polish, E2E, OpenAPI)
4. Las stories se integran de forma independiente

---

## Notes

- [P] tasks = archivos diferentes, sin dependencias entre sí
- [Story] label mapea la tarea a un user story específico para trazabilidad
- Cada user story debe ser completada y testeada de forma independiente
- **Importante**: El módulo `achievements` y el modelo `Achievement` **NO existen**; requieren creación. El mecanismo de eventos de dominio y el `RealtimeGateway` ya existen (patrón de `missions`). El trabajo principal es:
  - Crear `achievements.json`/`constellations.json` e integrar en `GameDataService`
  - Crear el modelo Prisma + migración
  - Crear el módulo `achievements/` (4 servicios + controller + DTOs) y registrar en `app.module.ts`
  - Añadir el endpoint público a `users`
  - Escribir tests unitarios y E2E
  - Implementar el frontend desktop (SVG + list + toast + export)
  - Exportar OpenAPI
- Commitear tras cada task o grupo lógico
- Parar en cada checkpoint para validar la story de forma independiente
- Evitar: tareas vagas, conflictos en el mismo archivo, dependencias cross-story que rompan independencia