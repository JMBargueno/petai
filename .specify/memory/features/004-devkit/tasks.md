---
description: "Task list for feature 004-devkit (DevKit + Hot Reloading de Game Data)"
---

# Tasks: DevKit + Hot Reloading de Game Data

**Input**: Design documents from `docs/specs/spec-04-devkit.md`, `spec.md`, `plan.md`, `contracts/api-contract.md`.

**Prerequisites**: plan.md (required), spec.md (required for user stories), contracts/.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=hot-reload, US2=simulate, US3=seed/action/validate)
- Include exact file paths in descriptions.

## Path Conventions

- **Backend**: `backend/src/modules/...`, `backend/test/...`, `backend/prisma/...`
- **CLI**: `tools/devkit/src/...`
- **Shared data**: `shared/game-data/*.json`

<!--
  Story mapping:
  - US1 (P1, MVP): Hot-reload de game data sin reiniciar → GameDataService hot-swappable, /dev/hot-reload, /dev/game-data, watcher chokidar, CLI watch.
  - US2 (P2): Balance simulator determinista → motor puro, CLI simulate.
  - US3 (P3): Seed programático + test harness + validación → /dev/seed, /dev/action, CLI seed/action/validate.
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create `tools/devkit/` scaffold: `package.json` (bin `petai-devkit`, devDeps `commander`, `chokidar`, `zod`, `@prisma/client`), `tsconfig.json` en `tools/devkit/`
- [ ] T002 [P] Add `commander` y `chokidar` a devDependencies del workspace en `tools/devkit/package.json` y registrar en `pnpm-workspace.yaml` si aplica
- [ ] T003 [P] Create `tools/devkit/src/index.ts` commander entry con subcomandos `watch`, `seed`, `simulate`, `action`, `validate` (placeholders)
- [ ] T004 [P] Create `tools/devkit/src/lib/game-data.ts` (carga de `shared/game-data/*.json` + resolver de dataDir) y `tools/devkit/src/lib/http-client.ts` (cliente REST para `/dev/*`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create `backend/src/modules/game-data/game-data.schemas.ts` con schemas zod por archivo (balance, species, patterns, foods, skills, missions) reutilizando las reglas de `scripts/validate-game-data.js`
- [ ] T006 Refactor `backend/src/modules/game-data/game-data.service.ts` a hot-swappable: encapsular en un `GameDataSnapshot`, exponer `reload(newData)` con validación zod + atomic swap, y mantener `getBalance/getSpecies/.../getCatalog` leyendo el snapshot vigente
- [ ] T007 [P] Extract the combat engine to a pure module `backend/src/modules/battles/combat/battle-sim.ts` (wrapper sin I/O que reutiliza `engine.ts` + `rng.ts`) exportable para simulate
- [ ] T008 Create `backend/src/modules/dev/` module skeleton: `dev.module.ts` (condición `NODE_ENV !== 'production'`), guard de registro y wiring en `game-data.module.ts`/`main.ts`
- [ ] T009 [P] Create `backend/src/modules/dev/dev.controller.ts` con las 4 rutas dev (`/dev/hot-reload`, `/dev/game-data`, `/dev/seed`, `/dev/action`) y decorators `@nestjs/swagger`, delegando a servicios

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Hot-reload de game data sin reiniciar (Priority: P1) 🎯 MVP

**Goal**: Editar `shared/game-data/*.json` y ver el cambio en memoria en < 2s sin reiniciar; rechazar JSON inválido conservando el snapshot válido.

**Independent Test**: Arrancar backend dev + watcher, editar `balance.json`, verificar `GET /dev/game-data` refleja el cambio en < 2s; escribir JSON inválido y verificar que no cambia.

### Tests for User Story 1 (optional - solo si se piden) ⚠️

- [ ] T010 [P] [US1] Unit test `backend/src/modules/game-data/game-data.service.spec.ts`: reload válido/inválido (atomic swap conserva snapshot anterior)
- [ ] T011 [P] [US1] E2E test `backend/test/dev.e2e-spec.ts`: `POST /dev/hot-reload` (inline) → `GET /dev/game-data` refleja cambio; JSON inválido → 400 sin cambio; `/dev/*` 404 con `NODE_ENV=production`

### Implementation for User Story 1

- [ ] T012 [US1] Implement `backend/src/modules/dev/dev-hot-reload.service.ts`: validar con zod + atomic swap sobre `GameDataService.reload()`; devolver `{ ok, file, version, changedFields }` o `400 { errors }`
- [ ] T013 [P] [US1] Implement `backend/src/modules/dev/game-data-watcher.service.ts`: `chokidar` sobre `shared/game-data/*.json` (los 6), debounce y disparar `dev-hot-reload.service.reloadFromDisk(file)` solo en dev
- [ ] T014 [US1] Wire `GET /dev/game-data` en `dev.controller.ts` a `GameDataService.getCatalog()` y `POST /dev/hot-reload` a `dev-hot-reload.service`
- [ ] T015 [P] [US1] Implement `tools/devkit/src/commands/watch.ts`: `petai-devkit watch` con `chokidar` que POSTea a `/dev/hot-reload` (o swap directo si se corre in-process) y loguea validación

**Checkpoint**: US1 MVP - hot-reload funcional sin reinicio.

---

## Phase 4: User Story 2 - Balance simulator con seed determinista (Priority: P2)

**Goal**: `petai-devkit simulate --combats=10000 --seed=42` produce reporte JSON (win rates, rounds, damage) determinista, offline, < 5s.

**Independent Test**: Ejecutar `simulate` dos veces con el mismo seed sin backend/DB y verificar output idéntico byte a byte.

### Tests for User Story 2 (optional) ⚠️

- [ ] T016 [P] [US2] Unit test `tools/devkit/src/test/simulate.spec.ts`: determinismo (mismo seed ⇒ output JSON idéntico) y win rates presentes
- [ ] T017 [P] [US2] Unit test `backend/src/modules/battles/combat/battle-sim.spec.ts`: wrapper puro no lee reloj/DB; misma semilla ⇒ mismo log (reafirma constitución II)

### Implementation for User Story 2

- [ ] T018 [US2] Implement `tools/devkit/src/lib/battle-sim.ts`: generar N luchadores desde `species.json`/`balance.json` con PRNG sembrado (mulberry32 vía `battle-sim.ts` del backend) y ejecutar combates
- [ ] T019 [US2] Implement `tools/devkit/src/commands/simulate.ts`: args `--combats`, `--seed`, `--out`; emite reporte JSON `{ seed, total, winRates(rareza/elemento), avgRounds, avgDamage }`; validar `--combats>0`
- [ ] T020 [P] [US2] Benchmark/verificación de perf: 10000 combates < 5s in-memory (SC-003) documentado en `tools/devkit/README.md`

**Checkpoint**: US2 - simulator determinista offline.

---

## Phase 5: User Story 3 - Seed programático, test harness y validación (Priority: P3)

**Goal**: `seed` rápido, `action` por CLI, `validate` de integridad entre JSON.

**Independent Test**: `seed --users=10 --pets=20` crea registros; `validate` reporta refs; `action feed --petId` invoca endpoint de test.

### Tests for User Story 3 (optional) ⚠️

- [ ] T021 [P] [US3] Unit test `tools/devkit/src/test/seed-gen.spec.ts`: distribución por level/rarity y `--dry-run` no persiste
- [ ] T022 [P] [US3] Unit test `tools/devkit/src/test/validate.spec.ts`: detecta referencias cruzadas rotas en fixtures (favoriteFood, rarity, elemento, ligas)
- [ ] T023 [P] [US3] E2E `backend/test/dev.e2e-spec.ts` (ampliación): `POST /dev/seed` devuelve `{ usersCreated, petsCreated, durationMs }`; `POST /dev/action` valida `petId` en servidor

### Implementation for User Story 3

- [ ] T024 [US3] Implement `backend/src/modules/dev/dev-seed.service.ts`: seed programático vía `@prisma/client` reutilizando `prisma/seed.ts`, aleatoriedad con `crypto` de Node (constitución I), con soporte `dryRun`
- [ ] T025 [P] [US3] Implement `backend/src/modules/dev/dev-action.service.ts`: test harness (`feed`, `battle`) que valida `petId`/`userId` en el servidor antes de ejecutar
- [ ] T026 [P] [US3] Implement `tools/devkit/src/lib/seed-gen.ts` y `tools/devkit/src/commands/seed.ts`: args `--users`, `--pets`, `--level=range(min,max)`, `--dry-run`; POST a `/dev/seed`
- [ ] T027 [P] [US3] Implement `tools/devkit/src/commands/action.ts`: `petai-devkit action <feed|battle> --petId=xxx` POST a `/dev/action`
- [ ] T028 [P] [US3] Implement `tools/devkit/src/commands/validate.ts`: verificación offline de referencias cruzadas entre JSON (reutiliza schemas zod de `game-data.schemas.ts`); exit 0/negro

**Checkpoint**: US3 - seed/harness/validación completos.

---

## Phase 6: Polish

**Purpose**: Documentation, hardening, contract sync, final validation

- [ ] T029 [P] Write `tools/devkit/README.md` (uso de `watch/seed/simulate/action/validate` + demo) — pregunta #2
- [ ] T030 [P] Regenerar `shared/openapi/openapi.json` con `pnpm export:openapi` para reflejar los endpoints `/dev/*` (constitución III)
- [ ] T031 Security hardening: confirmar que `/dev/*` NO se registra en producción (guard `NODE_ENV`) y no expone datos sensibles; revisión contra Constitución I/VIII
- [ ] T032 Run `pnpm --filter ... test` (unit) + `test:e2e` y validación manual de los AC1–AC7
- [ ] T033 Verify determinismo de combate tras el refactor (invarianta "misma seed ⇒ mismo log byte a byte") y tests de balance siguen pasando

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories. T005/T006 (schemas + hot-swappable service) y T007 (motor puro) son críticos.
- **User Stories (Phase 3+)**: All depend on Foundational.
  - US1, US2, US3 can proceed in parallel (if staffed).
  - Or sequentially in priority order (P1 → P2 → P3).
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories (es el MVP).
- **US2 (P2)**: Can start after Foundational; requiere T007 (motor puro). Independiente de US1.
- **US3 (P3)**: Can start after Foundational; `action` reusa el patrón de validación de `/dev/*` de US1, pero sigue independientemente testeable.

### Within Each User Story

- Tests (si se incluyen) MUST fallar antes de implementar.
- Schemas/entidades → servicios → endpoints → CLI.
- Core implementation before integration.
- Story complete before moving to next priority.

### Parallel Opportunities

- Setup: T001–T004 (T002–T004 [P]).
- Foundational: T005 → T006 (orden); T007, T008, T009 [P].
- US1: T010/T011 [P] (tests); T012 → T014 (orden); T013 y T015 [P].
- US2: T016/T017 [P] (tests); T018 → T019; T020 [P].
- US3: T021–T023 [P] (tests); T024 → T026; T025/T027/T028 [P].
- Diferentes user stories pueden avanzar en paralelo por distintos devs.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 (si se piden):
Task: "Unit test game-data.service.spec.ts (reload válido/inválido)"
Task: "E2E dev.e2e-spec.ts (hot-reload refleja cambio; 404 en prod)"

# Implementación:
Task: "dev-hot-reload.service.ts (zod + atomic swap)"
Task: "game-data-watcher.service.ts (chokidar) [P]"
Task: "CLI watch.ts [P]"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: hot-reload < 2s y rechazo atómico de JSON inválido (AC1, AC6)
5. Deploy/demo el DevKit mínimo

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test → Deploy/Demo (MVP: hot-reload)
3. Add User Story 2 → Test → Deploy/Demo (simulate determinista)
4. Add User Story 3 → Test → Deploy/Demo (seed/action/validate)
5. Cada historia añade valor sin romper las anteriores

### Parallel Team Strategy

- Dev A: US1 (hot-reload + watcher)
- Dev B: US2 (simulate + motor puro)
- Dev C: US3 (seed/action/validate)
- Setup + Foundational se completan primero (especialmente T005–T008)

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Cada user story debe ser independentemente completada y testeada.
- Verificar tests fallan antes de implementar (si se incluyen).
- Commit after each task or logical group.
- Respetar constitución: aleatoriedad con `crypto` de Node, determinismo del motor inalterado, `/dev/*` ausente en producción.