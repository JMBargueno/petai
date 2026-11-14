# Implementation Plan: Mood Theater

**Branch**: `[031-mood-theater]` | **Date**: 2025-02-01 | **Spec**: `./spec.md`

## Summary

Sistema de micro-actos espontáneos. Un motor de triggers puro evalúa el contexto y los vitals del pet para decidir el acto (con probabilidades y daily cap), el servicio lo persiste y emite el evento WS; el jugador puede capturar stickers y ver un feed social opt-in.

## Technical Context

- **Language/Version**: TypeScript (NestJS 10)
- **Primary Dependencies**: `@nestjs/common`, Prisma, `PetsService`, `RealtimeGateway`
- **Storage**: PostgreSQL (`MoodMoment`)
- **Testing**: Jest (unit del motor de triggers; integration de captura/feed)
- **Target Platform**: backend server
- **Performance Goals**: current/capture <300ms p95
- **Constraints**: daily cap estricto de 3 actos countables
- **Scale/Scope**: 1 módulo, 4 archivos

## Project Structure

```text
backend/src/modules/mood-theater/
├── mood-theater.module.ts
├── mood-theater.controller.ts
├── mood-theater.service.ts
└── moment-capture.service.ts
```

**Structure Decision**: Módulo de dominio estándar; el motor de triggers es puro (inyectable `now`/rand) para testear.

## Complexity Tracking

Sin violaciones de constitución: reutiliza vitals de pets y realtime existente.
