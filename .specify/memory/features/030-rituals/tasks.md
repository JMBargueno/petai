# Tasks: Rituals

**Input**: `./spec.md`, `./plan.md`

## Phase 1: Foundational

- [x] T001 Añadir modelos `Ritual` y `RitualProgress` a `backend/prisma/schema.prisma`
- [x] T002 Crear `rituals.module.ts`

## Phase 2: Detección (P1/P3)

- [x] T003 [P] `habit-detection.service.ts`: `detectCandidates(events)`, `shouldAdapt(shifts)`, tolerancia ±30min
- [x] T004 [P] `rituals.service.ts`: config de gifts por tipo, `list`, `active`, `create` (max 5), `check` (progresión/ruptura/gift)
- [x] T005 `rituals.controller.ts`: `GET /v1/rituals`, `POST /v1/rituals/create`, `GET /v1/rituals/active`, `POST /v1/rituals/:id/check`

## Phase 3: Integración

- [x] T006 Registrar `RitualsModule` en `app.module.ts`
- [x] T007 Emitir WS `ritual:progress` / `ritual:completed` / `ritual:missed`

## Dependencies & Execution Order

1. Schema + module
2. Engine puro → service → controller
3. Registro global + WS
