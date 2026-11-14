# Tasks: Combat Spectator

**Input**: Design documents from `.specify/memory/features/023-spectator/`

## Phase 1: Setup

- [x] T001 Create `backend/src/modules/spectator/` directory
- [x] T002 Add SpectatorSession, Highlight to Prisma schema

## Phase 2: Foundational

- [x] T003 Implement `highlight.service.ts` (detection logic, rating calculation)
- [x] T004 [P] Implement `spectator.service.ts` (subscribe, buffer, live state)

## Phase 3: User Story 1 - Live spectate (Priority: P1)

- [x] T005 [US1] `POST /v1/spectator/subscribe` endpoint
- [x] T006 [US1] `GET /v1/spectator/live` endpoint
- [x] T007 [US1] 10s delay buffer in Redis
- [x] T008 [US1] Max 100 spectators enforcement

## Phase 4: User Story 2 - Highlights (Priority: P2)

- [x] T009 [US2] Highlight detection on battle end (critical, comeback, long)
- [x] T010 [US2] Rating calculation
- [x] T011 [US2] `GET /v1/spectator/highlights` endpoint

## Phase 5: User Story 3 - Feed (Priority: P3)

- [x] T012 [US3] Weekly top 20 by rating
- [x] T014 [US3] Expiration (7 days)

## Phase 6: Polish

- [x] T013 Register SpectatorModule in app.module.ts
