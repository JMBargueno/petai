# Tasks: Mood Theater

**Input**: `./spec.md`, `./plan.md`

## Phase 1: Foundational

- [x] T001 Añadir modelo `MoodMoment` a `backend/prisma/schema.prisma`
- [x] T002 Crear `mood-theater.module.ts`

## Phase 2: Motor + servicio (P1)

- [x] T003 [P] `moment-capture.service.ts`: config de actos, `rollAct(pet, context)`, daily cap, cooldown
- [x] T004 [P] `mood-theater.service.ts`: `current`, `capture` (sticker, max 50), `feed`
- [x] T005 `mood-theater.controller.ts`: `GET /v1/mood-theater/current`, `POST /v1/mood-theater/capture`, `GET /v1/mood-theater/feed`

## Phase 3: Integración

- [x] T006 Registrar `MoodTheaterModule` en `app.module.ts`
- [x] T007 Emitir WS `pet:moment`

## Dependencies & Execution Order

1. Schema + module
2. Motor puro → service → controller
3. Registro global + WS
