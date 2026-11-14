# Implementation Plan: Combat Spectator

**Branch**: `[023-spectator]` | **Date**: 2025-01-30 | **Spec**: spec.md

## Summary

Modo espectación de combates en tiempo real con delay de 10s, highlights automáticos, y feed semanal. Backend gestiona suscripción, detección de highlights, y cálculo de rating.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: @nestjs/common, Prisma, Redis (buffer)
**Storage**: PostgreSQL (Prisma) + Redis (round buffer)
**Testing**: Jest
**Target Platform**: Linux server
**Project Type**: Web-service (NestJS)
**Performance Goals**: <500ms highlight query, 100 concurrent spectators
**Constraints**: 10s fixed delay, 100 spectators max
**Scale/Scope**: 1000 concurrent battles, 100 spectators/battle

## Project Structure

```text
backend/src/modules/spectator/
├── spectator.module.ts        # NestJS module
├── spectator.controller.ts    # REST endpoints
├── spectator.service.ts       # Subscribe, live state, buffer management
├── highlight.service.ts       # Highlight detection + rating
└── index.ts                   # Public exports
```
