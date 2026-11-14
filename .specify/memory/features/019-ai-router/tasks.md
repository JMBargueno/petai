# Tasks: Multi-Model AI Router

**Input**: Design documents from `.specify/memory/features/019-ai-router/`
**Prerequisites**: plan.md (required), spec.md (required)

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create `backend/src/modules/ai-router/` directory structure
- [x] T002 Create `llm-provider.interface.ts` with LlmProvider contract
- [x] T003 [P] Create provider adapters (openai, generic)

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Implement `model-router.service.ts` with provider selection logic
- [x] T005 Implement `fallback.service.ts` with circuit breaker pattern
- [x] T006 Create `ai-router.module.ts` registering all providers

## Phase 3: User Story 1 - Fallback automático (Priority: P1) 🎯 MVP

**Goal**: Chat funciona aunque un provider caiga

- [x] T007 [US1] Fallback cascading en model-router.service.ts
- [x] T008 [US1] Circuit breaker en fallback.service.ts (3 fallos → 60s open)
- [x] T009 [US1] SSE re-inicio transparente en provider adapters

## Phase 4: User Story 2 - Selección por interaction_type (Priority: P2)

**Goal**: Routing por complejidad reduce costos

- [x] T010 [US2] PolicyEngine: interaction_type → provider/model mapping
- [x] T011 [US2] AiRouterConfig Prisma model
- [x] T012 [US2] `POST /v1/ai/models/config` endpoint

## Phase 5: User Story 3 - Token budget (Priority: P3)

**Goal**: Control de costos per-request

- [x] T013 [US3] Budget check en model-router (maxTokens, maxCostUsd)
- [x] T014 [US3] `GET /v1/ai/models/budget` endpoint
- [x] T015 [US3] `GET /v1/ai/models` endpoint (providers + estado)

## Phase 6: Polish

- [x] T016 Register AiRouterModule in app.module.ts
- [x] T017 Extend AiConfig Prisma model with routing fields
- [x] T018 Add exports to index.ts

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 (MVP) → Phase 4 → Phase 5 → Phase 6
- T002 and T003 can run in parallel
- All user stories depend on Phase 2 completion
