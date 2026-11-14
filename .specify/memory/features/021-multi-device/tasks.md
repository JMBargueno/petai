# Tasks: Multi-Device Presence + Co-op

**Input**: Design documents from `.specify/memory/features/021-multi-device/`

## Phase 1: Setup

- [x] T001 Create `backend/src/modules/presence/` directory
- [x] T002 Add DevicePresence, CoopVisit, CoopFriendship to Prisma schema

## Phase 2: Foundational

- [x] T003 Implement `presence.service.ts` (Redis hash, heartbeat, expire)
- [x] T004 [P] Implement `coop-care.service.ts` (friendship validation, rate limit, visit actions)

## Phase 3: User Story 1 - Presencia (Priority: P1)

- [x] T005 [US1] `GET /v1/presence/:userId` endpoint
- [x] T006 [US1] Heartbeat processing + 90s expire

## Phase 4: User Story 2 - Visits (Priority: P2)

- [x] T007 [US2] `POST /v1/coop/visit` endpoint with friendship validation
- [x] T008 [US2] Rate limiting: 5 visits/day/pet/visitor (Redis)
- [x] T009 [US2] Visit action execution (feed/play/clean)

## Phase 5: User Story 3 - History (Priority: P3)

- [x] T010 [US3] `GET /v1/coop/history` endpoint

## Phase 6: Polish

- [x] T011 Register PresenceModule in app.module.ts
- [x] T012 Notification emission on visit (via EventEmitter)
