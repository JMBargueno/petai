# Tasks: Pet Buddies

**Input**: `./spec.md`, `./plan.md`

## Phase 1: Foundational

- [x] T001 Añadir modelos `BuddyPair` y `BuddyInteraction` a `backend/prisma/schema.prisma`
- [x] T002 Crear `buddies.module.ts` (imports PrismaModule/PetsModule/BondingModule/RealtimeModule)

## Phase 2: Motor de interacciones (P1)

- [x] T003 [P] `interaction-engine.service.ts`: `rollInteraction()` (distribución ponderada), `effectsFor(type)`, `COOLDOWN`, `DAILY_CAP`
- [x] T004 [P] `buddies.service.ts`: `pair`, `getForPet`, `interactions`, `trigger` (cooldown + cap + apply)
- [x] T005 `buddies.controller.ts`: `POST /v1/buddies/pair`, `GET /v1/buddies/:petId`, `GET /v1/buddies/interactions`, `POST /v1/buddies/trigger`

## Phase 3: Integración

- [x] T006 Registrar `BuddiesModule` en `app.module.ts`
- [x] T007 Emitir WS `buddy:interaction` vía `RealtimeGateway`

## Dependencies & Execution Order

1. Schema + module (foundation)
2. Engine (pure, testable) → service → controller
3. Registro global + WS
