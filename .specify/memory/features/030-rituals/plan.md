# Implementation Plan: Rituals

**Branch**: `[030-rituals]` | **Date**: 2025-02-01 | **Spec**: `./spec.md`

## Summary

Sistema de rituales con detección de patrones, progresión por rachas, recompensa al alcanzar 7 días y filosofía "sin castigo" en rupturas. Un motor de detección puro analiza eventos de interacción; el servicio aplica progresión, caps y regalos.

## Technical Context

- **Language/Version**: TypeScript (NestJS 10)
- **Primary Dependencies**: `@nestjs/common`, Prisma, `PetsService`, `RealtimeGateway`
- **Storage**: PostgreSQL (`Ritual`, `RitualProgress`)
- **Testing**: Jest (unit del motor de detección; integration de progresión)
- **Target Platform**: backend server
- **Performance Goals**: check <300ms p95
- **Constraints**: sin castigo punitivo; caps estrictos de rituales activos
- **Scale/Scope**: 1 módulo, 4 archivos

## Project Structure

```text
backend/src/modules/rituals/
├── rituals.module.ts
├── rituals.controller.ts
├── rituals.service.ts
└── habit-detection.service.ts
```

**Structure Decision**: Módulo de dominio estándar; el motor de detección es puro (inyectable `now`/random) para testear.

## Complexity Tracking

Sin violaciones de constitución: reutiliza cuentas de usuario y pets existentes.
