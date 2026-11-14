# Implementation Plan: Multi-Device Presence + Co-op

**Branch**: `[021-multi-device]` | **Date**: 2025-01-30 | **Spec**: spec.md

## Summary

Capa de presencia multi-device (Redis hash per user) y sistema de "visitas" entre amigos con autorización, rate limiting, badges y notificaciones.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: @nestjs/common, Redis (ioredis), Prisma
**Storage**: PostgreSQL (Prisma) + Redis (presencia, rate limit)
**Testing**: Jest
**Target Platform**: Linux server
**Project Type**: Web-service (NestJS)
**Performance Goals**: Heartbeat processing <10ms, presence read O(1)
**Constraints**: 1M users × 2 devices = 2M keys ≈ 200MB RAM
**Scale/Scope**: 1M users, 5 devices max/user, 10 friends max

## Project Structure

```text
backend/src/modules/presence/
├── presence.module.ts         # NestJS module
├── presence.controller.ts     # REST endpoints
├── presence.service.ts        # Redis-based presence tracking
├── coop-care.service.ts       # Visit logic, auth, rate limiting
└── index.ts                   # Public exports
```
