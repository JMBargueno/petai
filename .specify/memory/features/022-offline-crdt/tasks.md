# Tasks: Offline-First CRDT Sync

**Input**: Design documents from `.specify/memory/features/022-offline-crdt/`

## Phase 1: Setup

- [x] T001 Create `backend/src/modules/sync/` directory
- [x] T002 Add SyncVersion, SyncAction to Prisma schema

## Phase 2: Foundational

- [x] T003 Implement `crdt.service.ts` (LWW, merge, deterministic conflict resolution)
- [x] T004 [P] Implement `delta-sync.service.ts` (push/pull orchestration, versioning)

## Phase 3: User Story 1 - Push (Priority: P1)

- [x] T005 [US1] `POST /v1/sync/push` endpoint
- [x] T006 [US1] Action validation + idempotency check
- [x] T007 [US1] Batch processing (chunks of 50, max 500)

## Phase 4: User Story 2 - Pull (Priority: P2)

- [x] T008 [US2] `GET /v1/sync/pull` endpoint with sinceVersion
- [x] T009 [US2] Delta computation since version

## Phase 5: User Story 3 - Status (Priority: P3)

- [x] T010 [US3] `GET /v1/sync/status` endpoint

## Phase 6: Polish

- [x] T011 Register SyncModule in app.module.ts
- [x] T012 Rate limiting (50 actions/min)
