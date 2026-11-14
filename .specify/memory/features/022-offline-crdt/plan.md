# Implementation Plan: Offline-First CRDT Sync

**Branch**: `[022-offline-crdt]` | **Date**: 2025-01-30 | **Spec**: spec.md

## Summary

Sistema de sincronización delta push/pull con resolución de conflictos (LWW, merge, deterministic). El server aplica acciones en orden, valida, y retorna nuevo estado.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: @nestjs/common, Prisma, Redis (rate limit)
**Storage**: PostgreSQL (Prisma) + Redis (rate limit, sync state)
**Testing**: Jest
**Target Platform**: Linux server
**Project Type**: Web-service (NestJS)
**Performance Goals**: <5s sync para <100 acciones, <200ms per batch
**Constraints**: Idempotency, max 500 actions queue
**Scale/Scope**: Per-user sync, 500 actions max

## Project Structure

```text
backend/src/modules/sync/
├── sync.module.ts           # NestJS module
├── sync.controller.ts       # REST endpoints
├── crdt.service.ts          # Conflict resolution (LWW, merge, deterministic)
├── delta-sync.service.ts    # Push/pull orchestration
└── index.ts                 # Public exports
```
