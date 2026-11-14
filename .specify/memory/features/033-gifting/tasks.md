# Tasks: Gifting & Care Packages

**Input**: `./spec.md`, `./plan.md`

## Phase 1: Foundational

- [x] T001 Añadir modelos `Gift`, `CarePackage`, `GroupSession` a `backend/prisma/schema.prisma`
- [x] T002 Crear `gifting.module.ts` (imports Prisma/Realtime)

## Phase 2: Gifting (P1/P2)

- [x] T003 [P] `gifting.service.ts`: `send` (rate limits + transferencia), `accept`, `reject`, `history`
- [x] T004 [P] `care-package.service.ts`: `sendCarePackage` (valida sick, aplica heal+coins, rate limit)

## Phase 3: Group Feeding (P3)

- [x] T005 [P] `group-feeding.service.ts`: `createRoom`, `joinRoom`, `completeMinigame`, `finalize` (reparto 30/23.3)
- [x] T006 `gifting.controller.ts`: `POST /v1/gifting/send`, `GET /v1/gifting/history`, `POST /v1/care-packages/send`, `POST /v1/group-feeding/join` (+ accept/reject/complete)

## Phase 4: Integración

- [x] T007 Registrar `GiftingModule` en `app.module.ts`
- [x] T008 Emitir WS events (gift:*, care:*, group:*)

## Dependencies & Execution Order

1. Schema + module
2. Services (independientes) → controller
3. Registro global + WS
