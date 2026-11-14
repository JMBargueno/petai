# Implementation Plan: Voice AI

**Branch**: `[020-voice-ai]` | **Date**: 2025-01-30 | **Spec**: spec.md

## Summary

Pipeline STT→TTS con prosodia emocional por especie. Backend gestiona dispatch a servicios cloud (Whisper para STT, ElevenLabs para TTS), cache en Redis, y config data-driven por especie.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: @nestjs/common, OpenAI SDK (Whisper), ElevenLabs API
**Storage**: PostgreSQL (Prisma) + Redis (TTS cache)
**Testing**: Jest
**Target Platform**: Linux server
**Project Type**: Web-service (NestJS)
**Performance Goals**: p95 < 800ms pipeline completo
**Constraints**: Audio nunca se almacena en disco, solo Redis/memory
**Scale/Scope**: 100 concurrent sessions/servidor

## Project Structure

```text
backend/src/modules/voice/
├── voice.module.ts              # NestJS module
├── voice.controller.ts          # REST endpoints
├── stt.service.ts               # Speech-to-Text (Whisper dispatch)
├── tts.service.ts               # Text-to-Speech (ElevenLabs dispatch)
├── voice-config.service.ts      # Carga config por especie
└── index.ts                     # Public exports

shared/game-data/
└── voice-config.json            # Per-species voice parameters
```
