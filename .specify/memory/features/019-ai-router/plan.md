# Implementation Plan: Multi-Model AI Router

**Branch**: `[019-ai-router]` | **Date**: 2025-01-30 | **Spec**: spec.md

## Summary

Router de LLM multi-proveedor con selección por tipo de interacción, fallback cascading automático ante fallos (timeout/429/500), token budget per-request. Elimina SPOF y reduce costos hasta 60%.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: @nestjs/common, @nestjs/config, Prisma, Redis (ioredis)
**Storage**: PostgreSQL (Prisma) + Redis (circuit breaker, state)
**Testing**: Jest + Supertest
**Target Platform**: Linux server (NestJS)
**Project Type**: Web-service (NestJS backend)
**Performance Goals**: p95 < 2000ms al primer token
**Constraints**: Stateless router (solo Redis), <50 LOC por nuevo provider adapter
**Scale/Scope**: 5+ providers, 4 interaction types

## Constitution Check

- No violations. Router es stateless, usa patrón Adapter (open to extension), sigue el principio de responsabilidad única.

## Project Structure

### Source Code

```text
backend/src/modules/ai-router/
├── ai-router.module.ts        # NestJS module registration
├── ai-router.controller.ts    # REST endpoints
├── model-router.service.ts    # Core routing logic
├── llm-provider.interface.ts  # Provider interface contract
├── fallback.service.ts        # Circuit breaker + cascading
├── providers/
│   ├── openai.provider.ts     # OpenAI adapter
│   └── generic.provider.ts    # Generic/OpenAI-compatible adapter
└── index.ts                   # Public exports
```

## Complexity Tracking

No violations. The adapter pattern keeps each provider isolated. The circuit breaker state in Redis ensures horizontal scalability.
