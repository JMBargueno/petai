# Tasks: Voice AI

**Input**: Design documents from `.specify/memory/features/020-voice-ai/`

## Phase 1: Setup

- [x] T001 Create `backend/src/modules/voice/` directory
- [x] T002 [P] Create `shared/game-data/voice-config.json` with per-species params

## Phase 2: Foundational

- [x] T003 Implement `voice-config.service.ts` (loads JSON, resolves species params)
- [x] T004 [P] Implement `stt.service.ts` (Whisper API dispatch)
- [x] T005 [P] Implement `tts.service.ts` (ElevenLabs API dispatch + cache)

## Phase 3: User Story 1 - STT (Priority: P1)

- [x] T006 [US1] `POST /v1/voice/transcribe` endpoint in voice.controller.ts
- [x] T007 [US1] Audio validation (base64, size limits)

## Phase 4: User Story 2 - TTS (Priority: P2)

- [x] T008 [US2] `POST /v1/voice/speak` endpoint
- [x] T009 [US2] Emotion mapper: mood → voice params (pitch, speed)
- [x] T010 [US2] Redis TTS cache with species+emotion+text hash key

## Phase 5: User Story 3 - Config (Priority: P3)

- [x] T011 [US3] `GET /v1/voice/config/:speciesId` endpoint
- [x] T012 [US3] Default fallback for unknown species

## Phase 6: Polish

- [x] T013 Register VoiceModule in app.module.ts
- [x] T014 Create VoiceSession Prisma model
