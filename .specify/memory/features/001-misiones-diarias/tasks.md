---
description: "Task list for feature 001-misiones-diarias implementation"
---

# Tasks: Misiones y desafíos diarios/semanales

**Input**: Design documents from `.specify/memory/features/001-misiones-diarias/`

**Prerequisites**: plan.md ✅, spec.md ✅, contracts/api-contract.md ✅

**Tests**: Tests unitarios (`.spec.ts`) incluidos en el plan (Paso 4). Tests E2E en `backend/test/` (Paso 5).

**Organization**: Tareas agrupadas por user story para implementación independiente.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: Puede ejecutarse en paralelo (archivos diferentes, sin dependencias)
- **[Story]**: A qué user story pertenece (US1, US2, US3, US4, US5)
- Incluyen ruta exacta de archivo en la descripción

## Path Conventions

- **Backend (NestJS)**: `backend/src/`
- **Tests unitarios**: `backend/src/missions/*.spec.ts` (junto al código)
- **Tests E2E**: `backend/test/`
- **Prisma**: `backend/prisma/`
- **Shared config**: `shared/game-data/`
- **OpenAPI**: `shared/openapi/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencias y verificación de infraestructura existente

- [ ] T001 Añadir `@nestjs/schedule: ^6.0.0` y `@nestjs/event-emitter: ^3.0.0` a `backend/package.json` y ejecutar `pnpm install`
  - Depende de: nada
  - **Nota**: Sin estas deps, `ScheduleModule.forRoot()` y `EventEmitterModule.forRoot()` no funcionan

- [ ] T002 [P] Verificar que `shared/game-data/missions.json` es legible por `GameDataService.getMissions()` (retorna `{ daily: { minCount, maxCount, types[] }, weekly: { minCount, maxCount, types[] } }`)
  - Depende de: nada
  - **Archivo**: `shared/game-data/missions.json` (ya existe — solo verificar esquema)

- [ ] T003 [P] Verificar que el modelo `Mission` en `backend/prisma/schema.prisma` (líneas 299–319) tiene los índices correctos: `@@index([userId, period, periodEnd])` y `@@index([userId, completed])`
  - Depende de: nada
  - **Archivo**: `backend/prisma/schema.prisma` (ya existe — solo verificar)

**Checkpoint**: Dependencias instaladas, config de misiones accesible, modelo Prisma confirmado

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura del módulo que BLOQUEA todas las user stories

**⚠️ CRÍTICO**: Ninguna user story puede implementarse hasta completar esta fase

- [ ] T004 Crear `backend/src/missions/missions.module.ts` [NUEVO]
  - Implementar `@Module()` con:
    - `imports: [PrismaModule, RedisModule, GameDataModule, RealtimeModule]`
    - `controllers: [MissionsController]`
    - `providers: [MissionsService, MissionGenerationService, MissionTrackingService, MissionSchedulerService]`
    - `exports: [MissionsService]`
  - Depende de: T001 (necesita `@nestjs/schedule`, `@nestjs/event-emitter`)

- [ ] T005 Modificar `backend/src/app.module.ts` para registrar `ScheduleModule.forRoot()`, `EventEmitterModule.forRoot()` y `MissionsModule`
  - Depende de: T001, T004
  - **Cambio**: Agregar a `imports[]`: `ScheduleModule.forRoot()`, `EventEmitterModule.forRoot()`, `MissionsModule`

- [ ] T006 [P] Crear `backend/src/missions/dto/mission-claim.dto.ts` [NUEVO] con DTOs de respuesta para Swagger:
  - `MissionResponseDto` — `{ id, type, description, target, current, completed, reward{coins,gems,xp}, resetsAt }`
  - `MissionListResponseDto` — `{ timestamp, daily[], weekly[], dailyChestUnlocked }`
  - `MissionDetailResponseDto` — respuesta de `GET /missions/:id`
  - `MissionSummaryResponseDto` — `{ dailyCompleted, dailyTotal, weeklyCompleted, weeklyTotal, streak, bestStreak }`
  - `ClaimRewardResponseDto` — `{ mission{id,type,completed}, reward{coins,gems,xp}, dailyChestUnlocked }`
  - Decorar con `@ApiProperty()` / `@ApiPropertyOptional()`
  - Depende de: nada (solo tipos)

**Checkpoint**: Módulo registrado, deps cargadas, DTOs de Swagger listos → user stories pueden comenzar

---

## Phase 3: User Story 1 - Ver el panel de misiones al abrir la app (Priority: P1) 🎯 MVP

**Goal**: El jugador ve entre 3-5 misiones diarias y 5-7 semanales con objetivo, progreso y recompensa al llamar `GET /missions`

**Independent Test**: Llamar `GET /missions` con Bearer token → 200 con `daily[]` (3-5) y `weekly[]` (5-7), cada uno con `id`, `type`, `description`, `target`, `current`, `reward`, `resetsAt`

### Tests para User Story 1 ⚠️

> **Nota**: Escribir estos tests PRIMERO, asegurar que FALLAN antes de implementación

- [ ] T007 [P] [US1] Crear `backend/src/missions/missions.controller.spec.ts` [NUEVO] — Test unitario del controller:
  - `GET /missions` con token válido → 200 + cuerpo correcto
  - `GET /missions` sin token → 401
  - Routing correcto hacia `MissionsService.getMissions()`
  - Depende de: T004

- [ ] T008 [P] [US1] Crear `backend/src/missions/missions.service.spec.ts` [NUEVO] — Test unitario de `MissionsService`:
  - `getMissions()` retorna 3-5 diarias y 5-7 semanales (mock Prisma)
  - `getMissions()` dispara `generationService.ensureMissionsExist()` (lazy init)
  - `dailyChestUnlocked` es `true` solo si todas diarias completadas
  - `resetsAt` corresponde a medianoche local del usuario
  - Depende de: T004

### Implementación para User Story 1

- [ ] T009 [US1] Crear `backend/src/missions/missions.controller.ts` [NUEVO] con:
  - `@Controller('missions')` + `@UseGuards(AuthGuard)`
  - `GET /` → `missionsService.getMissions(@CurrentUser() user.id, user.timezone)`
  - `GET /summary` → `missionsService.getSummary(@CurrentUser() user.id, user.timezone)`
  - `GET /:id` → `missionsService.getMissionById(@CurrentUser() user.id, :id)`
  - `POST /:id/claim` → `missionsService.claimReward(@CurrentUser() user.id, :id)`
  - Swagger: `@ApiTags('Missions')`, `@ApiResponse()` usando DTOs de T006
  - Depende de: T005, T006
  - **Nota**: `MissionsService` ya existe con lógica de getMissions, getSummary, getMissionById, claimReward

- [ ] T010 [P] [US1] Verificar/completar `backend/src/missions/mission-generation.service.ts` [EXISTENTE]:
  - `ensureMissionsExist(userId, timezone)` genera on-the-fly si no hay misiones
  - `getDailyPeriod(timezone)` calcula medianoche local
  - `getWeeklyPeriod(timezone)` calcula lunes 00:00 local
  - `selectMissionTypes()` aplica anti-repetición (últimos 3 días)
  - `randomInt()` usa `crypto.randomInt()` (NO `Math.random()`)
  - Depende de: T002

- [ ] T011 [US1] Verificar `MissionsService.getMissions()` [EXISTENTE]:
  - Lazy init → query `prisma.mission.findMany` → `formatMission()` → `dailyChestUnlocked`
  - Depende de: T010

**Checkpoint**: US1 funcional — `GET /missions` retorna el panel completo. Validar de forma independiente.

---

## Phase 4: User Story 2 - Progreso en tiempo real (Priority: P2)

**Goal**: El progreso de misiones se incrementa automáticamente al disparar eventos de dominio y se emite `mission:progress` vía WebSocket

**Independent Test**: `POST /pets/:id/feed` → evento `pet:fed` → misión `feed` incrementa `current` → WS `mission:progress` emitido

### Tests para User Story 2 ⚠️

- [ ] T012 [P] [US2] Crear `backend/src/missions/mission-tracking.service.spec.ts` [NUEVO]:
  - `pet:fed` → misión `feed` incrementa `current` 1→2
  - `battle:finished` con `won: true` → incrementa `battle` Y `battle_win`
  - `egg:hatched` con `rarity: 'rare'` → incrementa `hatch` Y `hatch_rare`
  - Evento sin misión activa del tipo → no-op
  - `current >= target` → `completed: true` + emite `mission:completed`
  - Throttle: máx 1 emit `mission:progress` por 2s por misión
  - `current` no supera `target` (cap)
  - Depende de: T004

### Implementación para User Story 2

- [ ] T013 [US2] Verificar/completar `backend/src/missions/mission-tracking.service.ts` [EXISTENTE]:
  - `@OnEvent('pet:fed')` → `handleProgress(userId, 'feed')`
  - `@OnEvent('pet:cleaned')` → `handleProgress(userId, 'clean')`
  - `@OnEvent('pet:slept')` → `handleProgress(userId, 'sleep')`
  - `@OnEvent('pet:evolved')` → `handleProgress(userId, 'evolve')`
  - `@OnEvent('egg:hatched')` → `handleProgress(userId, 'hatch')` + condicional `hatch_rare`
  - `@OnEvent('battle:finished')` → `handleProgress(userId, 'battle')` + condicional `battle_win`
  - `@OnEvent('minigame:finished')` → `handleProgress(userId, 'minigame')`
  - `@OnEvent('chat:message_sent')` → `handleProgress(userId, 'chat')`
  - `@OnEvent('pet:level_up')` → `handleProgress(userId, 'level_up')`
  - `handleProgress()`: buscar misión → incrementar (cap) → completar si target → emit WS
  - Depende de: T005 (EventEmitterModule)

- [ ] T014 [P] [US2] Verificar/asegurar que `backend/src/modules/pets/pets.service.ts` emite `pet:level_up`
  - Confirmar `this.eventEmitter.emit('pet:level_up', { userId, petId })` al subir nivel
  - Si no existe, añadir la emisión del evento
  - Depende de: T005
  - **Nota**: El plan indica que este evento NO se emite actualmente

- [ ] T015 [US2] Verificar emit WebSocket en `MissionTrackingService`:
  - `mission:progress`: `{ missionId, current, target }` — throttled 2s
  - `mission:completed`: `{ missionId, type, reward, dailyCompleted, dailyTotal }`
  - Listener no bloquea acción principal (async vía `@OnEvent`)
  - Depende de: T013

**Checkpoint**: US2 funcional — misiones avanzan en tiempo real. Validar de forma independiente.

---

## Phase 5: User Story 3 - Recibir "¡Misión completada!" y reclamar recompensa (Priority: P3)

**Goal**: El jugador reclama la recompensa de una misión completada de forma atómica (solo 1 vez)

**Independent Test**: Misión completada → `POST /missions/:id/claim` → 200 + reward. 2ª vez → 409. Incompletada → 400. ID inválido → 404

### Tests para User Story 3 ⚠️

- [ ] T016 [P] [US3] Extender `backend/src/missions/missions.service.spec.ts` con tests de `claimReward()`:
  - Claim completada → 200, `claimed: true`, recompensa acreditada
  - Claim ya reclamada → 409 `ConflictException`
  - Claim incompletada → 400 `BadRequestException`
  - Claim inexistente/otro usuario → 404 `NotFoundException`
  - Race condition: 2 claims simultáneos → 1×200 + 1×409
  - Depende de: T008

### Implementación para User Story 3

- [ ] T017 [US3] Verificar `MissionsService.claimReward()` [EXISTENTE] implementa claim atómico:
  - `prisma.mission.updateMany({ where: { id, userId, completed: true, claimed: false }, data: { claimed: true } })`
  - Si `count === 0` → 404/400/409 según caso
  - Si `count === 1` → `prisma.user.update({ increment coins, gems, accountXp })`
  - Transacción atómica (updateMany + user update)
  - Depende de: T009

- [ ] T018 [US3] Verificar emit `mission:completed` al completar misión en `MissionTrackingService` [EXISTENTE]:
  - Payload: `{ missionId, type, reward: { coins, gems, xp }, dailyCompleted, dailyTotal }`
  - Solo al alcanzar `target` por primera vez
  - Depende de: T013

**Checkpoint**: US3 funcional — claims atómicos, errores correctos, WS emitido.

---

## Phase 6: User Story 4 - Desbloquear el cofre diario (Priority: P4)

**Goal**: Al completar todas las misiones diarias se desbloquea un cofre y se emite `mission:daily_complete`

**Independent Test**: Completar todas diarias → `GET /missions` retorna `dailyChestUnlocked: true` → WS `mission:daily_complete`

### Tests para User Story 4 ⚠️

- [ ] T019 [P] [US4] Extender `missions.service.spec.ts` con tests del cofre:
  - Todas diarias → `dailyChestUnlocked: true`
  - 1 incompleta → `dailyChestUnlocked: false`
  - Última diaria → emite `mission:daily_complete`
  - Feature #2 no disponible → stub de cofre (no falla)
  - Depende de: T016

### Implementación para User Story 4

- [ ] T020 [US4] Verificar lógica de desbloqueo en `missions.service.ts` [EXISTENTE]:
  - `getMissions()`: `dailyChestUnlocked = dailyCompleted === daily.length && daily.length > 0`
  - `claimReward()`: re-calcular `dailyChestUnlocked` post-claim
  - Stub: Si Feature #2 no existe, `unlockDailyChest()` → `{ chestId: 'stub', reward: { coins: 50, gems: 1 } }`
  - Depende de: T017

- [ ] T021 [US4] Emitir `mission:daily_complete` en `mission-tracking.service.ts` [EXISTENTE]:
  - Condición: `dailyCompleted === dailyTotal && dailyTotal > 0`
  - Solo la primera vez
  - `realtimeGateway.emitToUser(userId, 'mission:daily_complete', { chestUnlocked: true })`
  - Depende de: T013

**Checkpoint**: US4 funcional — bucle diario se cierra con el cofre.

---

## Phase 7: User Story 5 - Misiones semanales con progreso a 7 días (Priority: P5)

**Goal**: Misiones semanales (5-7) con reset cada lunes 00:00 local; scheduler gestiona resets

**Independent Test**: `GET /missions` incluye `period: "weekly"`. Lunes 00:00 local → job cierra anteriores y genera nuevas

### Tests para User Story 5 ⚠️

- [ ] T022 [P] [US5] Crear `backend/src/missions/mission-scheduler.service.spec.ts` [NUEVO]:
  - Cron detecta usuarios con misiones expiradas → genera nuevas
  - Batch `take: 100` — procesa en lotes
  - No duplica misiones si ya existen para el nuevo período
  - Cleanup: elimina misiones expiradas (> 7 días)
  - Weekly: lunes 00:00 local (no UTC)
  - DST transition: sin resets adelantados/demorados
  - Depende de: T004

### Implementación para User Story 5

- [ ] T023 [US5] Verificar/completar `backend/src/missions/mission-scheduler.service.ts` [EXISTENTE]:
  - `@Cron('*/5 * * * *')` → `checkResets()`
  - Buscar misiones expiradas en lotes de 100
  - Para cada usuario: determinar timezone, calcular nuevo período
  - Si `period === 'daily'` → `generationService.generateDailyMissions()`
  - Si `period === 'weekly'` → `generationService.generateWeeklyMissions()`
  - Cleanup: eliminar misiones `periodEnd < now - 7d`
  - Depende de: T005, T010

- [ ] T024 [US5] Verificar `MissionGenerationService.generateWeeklyMissions()`:
  - Genera 5-7 misiones con `period: 'weekly'`
  - `periodStart` = lunes 00:00 local
  - `periodEnd` = lunes siguiente 00:00 local
  - Anti-repetición semanal (últimos 7 días)
  - Depende de: T010

**Checkpoint**: US5 funcional — misiones semanales con reset correctos.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integración, tests E2E, documentación y validación final

- [ ] T025 [P] Crear `backend/test/missions.e2e-spec.ts` [NUEVO] — Test E2E con Supertest:
  - Flujo: registro → login → crear pet → `GET /missions` → feed → `mission:progress` → completar diarias → `dailyChestUnlocked: true` → claim → race condition (2×claim: 1×200 + 1×409) → reset por timezone
  - Depende de: T009, T013, T017

- [ ] T026 [P] Ejecutar `pnpm export:openapi` → `shared/openapi/openapi.json` con endpoints de misiones
  - Depende de: T009

- [ ] T027 [P] Reemplazar `Math.random()` por `crypto.randomInt()` en `mission-generation.service.ts` si aplica
  - `import { randomInt } from 'crypto'` → `randomInt(min, max + 1)`
  - Depende de: T010
  - **Nota**: Constitución I exige aleatoriedad criptográficamente segura

- [ ] T028 Verificar persistencia en PostgreSQL (flush Redis → PG cada 30s o al completar)
  - Si Redis caído → fallback directo a PG
  - Depende de: T013

- [ ] T029 Ejecutar suite de tests completa:
  - `cd backend && pnpm test -- --testPathPattern missions`
  - `cd backend && pnpm test:e2e -- --testPathPattern missions`
  - Cobertura de línea > 80% en `src/missions/`
  - Depende de: T025, T027, T028

- [ ] T030 [P] Validar contra `contracts/api-contract.md`:
  - Respuestas REST matchean contrato (status, campos, formato)
  - Eventos WS matchean contrato (payload, naming)
  - Errores en formato `{ statusCode, message }`
  - Depende de: T009, T017, T020

**Checkpoint**: Feature completa — todos los tests pasan, OpenAPI actualizado, contrato validado

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede comenzar inmediatamente
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA todas las user stories
- **User Stories (Phases 3–7)**: Todas dependen de Foundational
  - US1 (P1) → base, no depende de otras stories
  - US2 (P2) → integra con US1 (necesita misiones activas para avanzar)
  - US3 (P3) → depende de US2 (completar misiones para reclamar)
  - US4 (P4) → depende de US2 + US3 (todas diarias + claim)
  - US5 (P5) → independiente para misiones semanales; scheduler es cross-cutting
- **Polish (Phase 8)**: Depende de todas las user stories deseadas

### User Story Dependencies

- **US1 (P1)**: Inicia tras Phase 2 — Sin dependencias de otras stories
- **US2 (P2)**: Inicia tras Phase 2 — Necesita misiones existentes (US1), testeable independiente
- **US3 (P3)**: Inicia tras Phase 2 — Necesita tracking (US2), pero claim testeable con datos seed
- **US4 (P4)**: Inicia tras US3 — Necesita claim funcional y todas diarias completadas
- **US5 (P5)**: Inicia tras Phase 2 — Independiente (semanales + scheduler); paralelo con US1-US3

### Within Each User Story

- Tests escritos y FAIL antes de implementación
- Verificación de servicios existentes antes de crear nuevos
- Controller → Service → Prisma (capa a capa)
- Story completa antes de pasar a la siguiente prioridad

### Parallel Opportunities

- **Phase 1**: T002 y T003 en paralelo con T001
- **Phase 2**: T006 (DTOs) en paralelo con T004/T005 (módulo)
- **US1**: T007 y T008 (tests) en paralelo; T010 en paralelo con T002
- **US2**: T012 (tests tracking) en paralelo con T014 (pet:level_up)
- **US3**: T016 (tests claim) en paralelo con T017 (verificación)
- **US4**: T019 (tests cofre) en paralelo con T020/T021
- **US5**: T022 (tests scheduler) en paralelo con T023
- **Cross-story**: US1, US2 y US5 en paralelo con 3 devs tras Phase 2
- **Phase 8**: T025, T026, T027 en paralelo

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de US1 juntos:
Task: "Test unitario del controller: GET /missions 200/401/routing en missions.controller.spec.ts"
Task: "Test unitario del service: getMissions lazy init, dailyChestUnlocked en missions.service.spec.ts"

# Lanzar verificaciones en paralelo:
Task: "Verificar mission-generation.service.ts: ensureMissionsExist, anti-repetición, crypto.randomInt"
Task: "Verificar missions.service.ts getMissions(): lazy init, query, formato, edge cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001-T003)
2. Completar Phase 2: Foundational (T004-T006) — CRÍTICO, bloquea todo
3. Completar Phase 3: User Story 1 (T007-T011)
4. **PARAR Y VALIDAR**: Testear `GET /missions` de forma independiente
5. Deploy/demo del MVP

### Incremental Delivery

1. Setup + Foundational → Fundación lista
2. US1 → Testear → Deploy/Demo (**MVP!**)
3. US2 → Testear → Deploy/Demo (progreso en tiempo real)
4. US3 → Testear → Deploy/Demo (claims atómicos)
5. US4 → Testear → Deploy/Demo (cofre diario)
6. US5 → Testear → Deploy/Demo (semanales + scheduler)
7. Cada story agrega valor sin romper las anteriores

### Parallel Team Strategy

Con 3 developers:

1. **Todos juntos**: Setup + Foundational (Phase 1-2, ~1 día)
2. **Tras Phase 2**:
   - **Dev A**: US1 → US3 (MVP + recompensas)
   - **Dev B**: US2 (tracking en tiempo real)
   - **Dev C**: US5 (semanales + scheduler)
3. **Tras US3**: **Dev A** → US4 (cofre diario, ~2h)
4. **Todos juntos**: Phase 8 (Polish, E2E, OpenAPI)
5. Las stories se integran de forma independiente

---

## Notes

- [P] tasks = archivos diferentes, sin dependencias entre sí
- [Story] label mapea la tarea a un user story específico para trazabilidad
- Cada user story debe ser completada y testeada de forma independiente
- **Importante**: Muchos servicios YA EXISTEN (`missions.service.ts`, `mission-generation.service.ts`, `mission-tracking.service.ts`, `mission-scheduler.service.ts`). El trabajo principal es:
  - Crear `missions.module.ts` y `missions.controller.ts` (conecta todo)
  - Registrar en `app.module.ts`
  - Añadir DTOs de Swagger
  - Verificar que la lógica existente cumple los requisitos del spec
  - Escribir tests unitarios y E2E
  - Asegurar `crypto.randomInt()` (Constitución I)
  - Añadir emisión de `pet:level_up` en pets service
- Commitear tras cada task o grupo lógico
- Parar en cada checkpoint para validar la story de forma independiente
- Evitar: tareas vagas, conflictos en el mismo archivo, dependencias cross-story que rompan independencia