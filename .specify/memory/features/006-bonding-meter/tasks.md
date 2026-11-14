---
description: "Task list for feature 006-bonding-meter implementation"
---

# Tasks: Bonding Meter (Métrico de Vínculo)

**Input**: Design documents from `.specify/memory/features/006-bonding-meter/`

**Prerequisites**: plan.md ✅, spec.md ✅, contracts/api-contract.md ✅

**Tests**: Tests unitarios (`.spec.ts`) en el motor `bonding.ts` y en `BondingService` (junto al código). Test E2E en `backend/test/bonding.e2e-spec.ts`.

**Organization**: Tareas agrupadas por user story para implementación independiente.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: Puede ejecutarse en paralelo (archivos diferentes, sin dependencias)
- **[Story]**: A qué user story pertenece (US1, US2, US3)
- Incluyen ruta exacta de archivo en la descripción

## Path Conventions

- **Backend (NestJS)**: `backend/src/`
- **Tests unitarios**: `backend/src/modules/bonding/*.spec.ts` (junto al código)
- **Tests E2E**: `backend/test/`
- **Prisma**: `backend/prisma/`
- **Shared config**: `shared/game-data/`
- **OpenAPI**: `shared/openapi/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Datos de balance y esquema de datos (sin código de feature aún)

- [x] 001 [P] Añadir la sección `bonding` a `shared/game-data/balance.json`: `interactions` (feed 2, battle 3, minigame 2, chat 1, clean 1, sleep 0.5, evolve 5), `decayRatePerDay` 0.5, `graceWindowHours` 24, `decayStartHours` 48 y `tiers[]` (acquainted/companion/ally/soulmate/legend). Incrementar `version` del JSON
  - Depende de: nada
  - **Archivo**: `shared/game-data/balance.json`
  - **Nota**: Fuente única de constantes (Constitución VII). Si `GameDataService` valida `balance.json` con Zod, añadir `bonding` al schema

- [x] 002 Modificar `backend/prisma/schema.prisma`: añadir a `Pet` los campos `bonding Float @default(0)`, `bondingTier String @default("acquainted")`, `lastInteractionAt DateTime @default(now())` y la relación `bondingEvents BondingEvent[]`; añadir el `model BondingEvent` con `@@index([petId, createdAt])`. Generar la migración (`pnpm --filter backend prisma migrate dev --name add_bonding`)
  - Depende de: nada
  - **Archivo**: `backend/prisma/schema.prisma` + migración en `backend/prisma/migrations/`

**Checkpoint**: Balance con `bonding` cargado por `GameDataService`; esquema Prisma con `Pet.bonding*` y `BondingEvent` migrado

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Módulo de dominio, motor puro y servicio que BLOQUEAN todas las user stories

**⚠️ CRÍTICO**: Ninguna user story puede implementarse hasta completar esta fase

- [x] 003 Crear `backend/src/modules/bonding/bonding.ts` [NUEVO]: motor **puro** (sin dependencias de Nest) con: `tierForValue(value, tiers)` → id de tier, `clampBonding(v)` → `[0,100]`, `decayAmount(hoursIdle, cfg)` → 0 si `< graceWindow`, `decayRatePerDay × (hoursIdle−48)/24` si `> 48` (redondeo a 2 dec.), `round2(n)`. Exporta tipos `BondingTier`/`BondingConfig`
  - Depende de: T001 (forma de `balance.bonding`)
  - **Archivo**: `backend/src/modules/bonding/bonding.ts`

- [x] 004 [P] Crear `backend/src/modules/bonding/bonding.spec.ts` [NUEVO]: tests del motor puro — `tierForValue` en cada frontera (0/29/30/59/60/79/80/99/100), `clampBonding` (cap 100, floor 0), `decayAmount` (0 si <24h, 0 si 48h exacto, >0 si >48h, lineal con días), `round2`
  - Depende de: T003
  - **Nota**: Asegurar que los tests **FAIL** antes de implementar `bonding.ts` (TDD)

- [x] 005 Crear `backend/src/modules/bonding/bonding.service.ts` [NUEVO]: inyecta `PrismaService`, `GameDataService`, `RealtimeGateway`. Métodos: `recordInteraction(petId, userId, type)` (transacción: `clamp(bonding+inc,0,100)`, recalc tier, `lastInteractionAt=now`, crear `BondingEvent`; emite `bonding:tier_up` si cambió), `getBondingDetail(petId, userId, limit, cursor)` (valor, tier, `history` paginada, `decayInfo`, `unlocks`), y un helper `applyDecay(pet, now)` (reutilizable por `applyLazyTick`). Valida `type` contra `balance.bonding.interactions` (sino `BadRequestException`)
  - Depende de: T003
  - **Archivo**: `backend/src/modules/bonding/bonding.service.ts`

- [x] 006 [P] Crear `backend/src/modules/bonding/dto/bonding.dto.ts` [NUEVO] con `@nestjs/swagger` decorators: `BondingFieldsDto` (para `GET /pets/:id`), `BondingDetailResponseDto`, `BondingEventDto`, `DecayInfoDto`, `UnlocksDto`, `HistoryPageDto` (coinciden con `contracts/api-contract.md`)
  - Depende de: nada
  - **Archivo**: `backend/src/modules/bonding/dto/bonding.dto.ts`

- [x] 007 Crear `backend/src/modules/bonding/bonding.module.ts` [NUEVO]: `@Module()` con `imports: [PrismaModule, GameDataModule, RealtimeModule]`, `providers: [BondingService]`, `exports: [BondingService]`
  - Depende de: T005

- [x] 008 Modificar `backend/src/app.module.ts`: registrar `BondingModule` en `imports[]`
  - Depende de: T007

- [x] 009 [P] Crear `backend/src/modules/bonding/bonding.service.spec.ts` [NUEVO]: tests del servicio — `recordInteraction` (incremento correcto, cap/floor, `lastInteractionAt` se actualiza, `BondingEvent` creada, `type` inválido → 400, multi-pet aislado), `applyDecay` (ventana de gracia 24h, decaimiento >48h, idempotencia ante doble lectura), emisión de `bonding:tier_up`/`tier_down`/`decay`
  - Depende de: T005

**Checkpoint**: Módulo `bonding` compilable e inyectable; motor puro y servicio testeados; DTOs de Swagger listos

---

## Phase 3: User Story 1 - "El vínculo sube con lo que hago" (Priority: P1) 🎯 MVP

**Goal**: El vínculo sube con cada interacción, se persiste con auditoría, se ve en `GET /pets/:id` y emite `bonding:tier_up`.

**Independent Test**: Disparar `feed` y verificar `GET /pets/:id` incluye `bonding`/`bondingTier`/`lastInteractionAt`; cruzar umbral 29→30 emite `bonding:tier_up`; cap 100 y floor 0 respetados.

### Implementation for User Story 1

- [x] 010 [US1] Inyectar `BondingService` en `PetsService` (`backend/src/modules/pets/pets.service.ts`) e importar `BondingModule` en `backend/src/modules/pets/pets.module.ts`; invocar `recordInteraction(petId, userId, 'feed')` y `'clean'` tras la acción exitosa en `feed()` y `clean()`
  - Depende de: T005
  - **Archivo**: `backend/src/modules/pets/pets.service.ts`, `backend/src/modules/pets/pets.module.ts`

- [x] 011 [P] [US1] Invocar `recordInteraction(..., 'battle')` en el servicio de `battles` tras terminar la pelea, `'minigame'` en `minigames` tras premio, `'chat'` en `ai.chat` tras turno, `'sleep'` en `pets.sleep`, `'evolve'` en la evolución (conservando el vínculo previo). Inyectar `BondingService`/importar `BondingModule` en cada módulo
  - Depende de: T005
  - **Archivos**: `backend/src/modules/battles/`, `backend/src/modules/minigames/`, `backend/src/modules/ai/chat.service.ts`, `backend/src/modules/pets/`

- [x] 012 [US1] Actualizar `pets.service.getPetById` / `getPets` para que la respuesta incluya `bonding`, `bondingTier` (ya calculado), `bondingTierName` y `lastInteractionAt`; exponer los `@ApiProperty` correspondientes en el DTO del pet (`backend/src/modules/pets/`)
  - Depende de: T002, T006
  - **Archivo**: `backend/src/modules/pets/pets.service.ts`, `backend/src/modules/pets/pets.controller.ts`

**Checkpoint (US1)**: MVP — el vínculo sube y se ve; `GET /pets/:id` lo incluye y `bonding:tier_up` se emite

---

## Phase 4: User Story 2 - "Si me voy, el vínculo se enfría" (Priority: P2)

**Goal**: El decaimiento por abandono vive en el lazy tick; `GET /pets/:id/bonding` expone detalle (historial + `decayInfo`); WS `bonding:tier_down` / `bonding:decay`.

**Independent Test**: Simular `lastInteractionAt` a 72h → `applyLazyTick` decae `bonding` y crea `BondingEvent(reason="decay")`; a 20h no decae; `GET /pets/:id/bonding` devuelve `{ value, tier, history, decayInfo }`.

### Implementation for User Story 2

- [x] 013 [US2] Integrar el decaimiento de vínculo en `applyLazyTick` (`backend/src/modules/pets/pets.service.ts`): llamar a `bonding.applyDecay(pet, now)` antes de `pet.update`; persistir `BondingEvent(reason="decay")` si hay caída, re-fijar base de referencia (idempotencia) y emitir `bonding:tier_down`/`bonding:decay` vía `RealtimeGateway`
  - Depende de: T005, T010
  - **Archivo**: `backend/src/modules/pets/pets.service.ts`

- [x] 014 [US2] Añadir `GET /pets/:id/bonding` en `backend/src/modules/pets/pets.controller.ts` que delega en `bonding.getBondingDetail(...)` (guard `@CurrentUser`, sin `userId` en body, query `limit`/`cursor`); responder con `BondingDetailResponseDto`
  - Depende de: T005, T006
  - **Archivo**: `backend/src/modules/pets/pets.controller.ts`, `backend/src/modules/pets/pets.service.ts`

**Checkpoint (US2)**: el vínculo decae por abandono y `GET /pets/:id/bonding` muestra detalle completo

---

## Phase 5: User Story 3 - "Cuanto más nos unimos, más me conoce" (Priority: P3)

**Goal**: La IA reacciona al vínculo (`bondingTier` en prompt, memoria OR, reacciones soulmate) y el contrato expone los desbloqueos (saludo, patrón, duerme cerca).

**Independent Test**: Con `bondingTier=ally` el chat inyecta memoria; con `soulmate` el prompt lleva reacciones; con `bonding=100` `GET /pets/:id/bonding` devuelve `unlocks.patternUnlocked=true` y `sleepNearCursor=true`.

### Implementation for User Story 3

- [x] 015 [US3] Inyectar `bondingTier` en `buildSystemPrompt` (`backend/src/modules/ai/personality.ts`): aceptar `bondingTier` en el parámetro de opciones y añadir una línea de contexto por tier; en `soulmate` (80+) añadir la directiva de reacciones emocionales personalizadas sin alterar rasgo+mood
  - Depende de: T012
  - **Archivo**: `backend/src/modules/ai/personality.ts`

- [x] 016 [US3] Habilitar el recuerdo de `PetMemory` también por vínculo en `backend/src/modules/ai/chat.service.ts`: cambiar la condición de `intelligence >= MEMORY_UNLOCK` a `intelligence >= MEMORY_UNLOCK || bondingTier >= 'ally'` (idempotente — no duplicar el bloque); pasar `bondingTier` a `buildSystemPrompt`
  - Depende de: T015
  - **Archivo**: `backend/src/modules/ai/chat.service.ts`

- [x] 017 [P] [US3] Exponer en `GET /pets/:id/bonding` el objeto `unlocks` (`greeting`, `memoryRecall`, `emotionalReactions`, `patternUnlocked`, `sleepNearCursor`) calculado desde el tier en `BondingService.getBondingDetail`; en `legend` marcar `patternUnlocked` (patrón exclusivo del catálogo) y `sleepNearCursor`
  - Depende de: T014
  - **Archivo**: `backend/src/modules/bonding/bonding.service.ts`

**Checkpoint (US3)**: la IA y los desbloqueos visuales reaccionan al vínculo

---

## Phase 6: Polish (E2E, Contrato, Docs)

- [x] 018 [P] Crear `backend/test/bonding.e2e-spec.ts` [NUEVO]: flujo completo — login → pet → feed (sube + `bonding:tier_up` WS) → `GET /pets/:id` incluye vínculo → `GET /pets/:id/bonding` (history/decayInfo/unlocks) → seedear `lastInteractionAt` a 72h y re-leer (decae + `BondingEvent decay`) → chat con `ally` inyecta memoria → `bonding=100` expone `patternUnlocked`/`sleepNearCursor`
  - Depende de: T010-T017
  - **Archivo**: `backend/test/bonding.e2e-spec.ts`

- [x] 019 Ejecutar `pnpm export:openapi` y verificar que `shared/openapi/openapi.json` incluye los nuevos DTOs (`BondingFieldsDto`, `BondingDetailResponseDto`) y el endpoint `GET /pets/:id/bonding`
  - Depende de: T012, T014, T017

- [x] 020 [P] Ejecutar la suite de tests unitarios y E2E (`pnpm --filter backend test`), confirmar SC-001..SC-007; commitear
  - Depende de: T018

**Checkpoint**: Contrato exportado, tests en verde, docs coherentes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede arrancar inmediatamente
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA todas las user stories
- **User Stories (Phase 3-5)**: Todas dependen de Foundational
  - Pueden proceder en paralelo (si hay equipo) o secuencialmente por prioridad (P1 → P2 → P3)
  - US2 y US3 se integran con US1 pero son testeables por sí solas
- **Polish (Phase 6)**: Depende de todas las user stories deseadas

### User Story Dependencies

- **US1 (P1)**: Arranca tras Foundational (Phase 2) — sin dependencias de otras stories
- **US2 (P2)**: Arranca tras Foundational; integra con US1 (el valor/tier de US1) pero testeable de forma aislada
- **US3 (P3)**: Arranca tras Foundational; integra con US1/US2 (rango + estado estable) pero testeable de forma aislada

### Within Each User Story

- Motor puro y tests (`bonding.ts`) antes del servicio
- Servicios antes de endpoints
- Endpoint antes de la integración con IA/WS de esa story
- Story completa antes de pasar a la siguiente prioridad

### Parallel Opportunities

- **Phase 1**: T001 (balance) en paralelo con T002 (schema/migración)
- **Phase 2**: T004 (tests motor) en paralelo con T003 (motor); T006 (DTOs) en paralelo con T005 (servicio); T009 (tests servicio) en paralelo con la integración
- **US1**: T010 (feed/clean) en paralelo con T011 (battle/minigame/chat/sleep/evolve); T012 tras
- **US2**: T013 (decay) y T014 (endpoint) en paralelo
- **US3**: T017 (unlocks) en paralelo con T015/T016 (IA)
- **Cross-story**: US1, US2 y US3 en paralelo con 3 devs tras Phase 2
- **Phase 6**: T018 y T020 en paralelo

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001-T002)
2. Completar Phase 2: Foundational (T003-T009) — CRÍTICO, bloquea todo
3. Completar Phase 3: User Story 1 (T010-T012)
4. **PARAR Y VALIDAR**: testear `GET /pets/:id` con el vínculo y el WS `bonding:tier_up` de forma independiente
5. Deploy/demo del MVP

### Incremental Delivery

1. Setup + Foundational → Fundación lista
2. US1 → Testear → Deploy/Demo (**MVP!**)
3. US2 → Testear → Deploy/Demo (decaimiento + detalle)
4. US3 → Testear → Deploy/Demo (IA + desbloqueos)
5. Cada story agrega valor sin romper las anteriores

### Parallel Team Strategy

Con 3 developers:

1. **Todos juntos**: Setup + Foundational (Phase 1-2, ~1 día)
2. **Tras Phase 2**:
   - **Dev A**: US1 (T010-T012)
   - **Dev B**: US2 (T013-T014)
   - **Dev C**: US3 (T015-T017)
3. **Todos juntos**: Phase 6 (E2E, OpenAPI, tests)
4. Las stories se integran de forma independiente

---

## Notes

- [P] tasks = archivos diferentes, sin dependencias entre sí
- [Story] label mapea la tarea a un user story específico para trazabilidad
- Cada user story debe ser completada y testeada de forma independiente
- **Importante**: `applyLazyTick`, `feed`/`clean`, `buildSystemPrompt`, `memory.recall`, `RealtimeGateway.emitToUser` y `GameDataService.getBalance()` **YA EXISTEN**. El trabajo principal es:
  - Crear el dominio `modules/bonding/` (motor puro + servicio + DTOs + módulo) y registrarlo en `app.module.ts`
  - Añadir `bonding`/`bondingTier`/`lastInteractionAt` a `Pet` y crear `BondingEvent` (migración)
  - Añadir la sección `bonding` a `balance.json`
  - Inyectar `recordInteraction` en las acciones existentes y `applyDecay` en `applyLazyTick`
  - Exponer `GET /pets/:id/bonding` y los campos de vínculo en `GET /pets/:id`
  - Inyectar `bondingTier` al prompt de IA (OR con la memoria existente)
  - Escribir tests unitarios (motor + servicio) y E2E
- Commitear tras cada task o grupo lógico
- Parar en cada checkpoint para validar la story de forma independiente
- Evitar: tareas vagas, conflictos en el mismo archivo, dependencias cross-story que rompan independencia