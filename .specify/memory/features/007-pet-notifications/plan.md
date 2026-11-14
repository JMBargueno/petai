# Implementation Plan: Pet Notifications con Personalidad

**Branch**: `007-pet-notifications` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/memory/features/007-pet-notifications/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Reemplazo de notificaciones genéricas por mensajes personalizados según personalidad (`Pet.personality.trait`), bonding tier (`Pet.bondingTier`) y contexto del evento. Los mensajes se generan con IA (1 frase, máx 50 tokens, timeout 5s → fallback plantilla) o con plantillas de `notifications.json`. El dispatch aplica rate limit (Redis counter 3/día configurable), dedup (5 min por categoría), quiet hours (23:00-07:00 zona del usuario) y toggles por categoría. Se emite por WS `pet:notification` → escritorio muestra vía Tauri notification plugin.

**Enfoque técnico**:
- Nuevo módulo `backend/src/modules/notifications/` (NestJS) con dos servicios: `NotificationGeneratorService` (genera texto: IA o plantilla) y `NotificationDispatcherService` (decide SI notificar: rate limit, dedup, prefs, quiet hours).
- `notifications.json` en `shared/game-data/` con plantillas por personalidad × tier × categoría (cargado vía `GameDataService`).
- Rate limit: Redis `INCR` + `EXPIRE` (counter diario, TTL 24h). Dedup: Redis key con TTL 5 min por categoría.
- IA: se reutiliza el mecanismo de LLM call de `AiModule` con `max_tokens=50`, `timeout=5000`; si falla → plantilla (no cuenta en `AiUsage`).
- WS: `RealtimeGateway.emitToUser(userId, 'pet:notification', payload)` (namespace `realtime`).
- Schema: `User.notificationPrefs Json?` (migración Prisma). `PATCH /me` ampliado con `notificationPrefs`.
- Escritorio: WS listener → Tauri notification plugin + `NotificationSettingsPanel` (toggles + slider) + inbox offline.
- Contratos REST documentados con `@nestjs/swagger` → `shared/openapi/openapi.json`.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS

**Primary Dependencies**: NestJS 11, Prisma ORM, ioredis (RedisModule existente), socket.io 4.8 (RealtimeModule), @nestjs/jwt + passport-jwt, @nestjs/swagger, @nestjs/event-emitter

**Storage**: PostgreSQL (vía Prisma ORM) — `User.notificationPrefs Json?` (nuevo campo); Redis (efímero) para rate limit counters y dedup keys

**Testing**: Jest (unitarios `.spec.ts` junto al código del módulo), Supertest (E2E en `backend/test/`)

**Target Platform**: Linux server (Docker) — backend; Tauri 2 + Svelte 5 — escritorio

**Project Type**: web-service (REST + WebSocket API autoritativo) + desktop client

**Performance Goals**: <100ms p95 para `PATCH /me` / `GET /me`; LLM call <5s (timeout duro); Redis ops <5ms; WS emit <10ms

**Constraints**:
- Backend autoritativo (Constitución I): `userId`/`petId` de la sesión/eventos internos, nunca del body
- LLM call máx 1 por evento, 50 tokens, timeout 5s → fallback plantilla (FR-002/008)
- Rate limit configurable, default 3/día (Redis counter, TTL 24h)
- Dedup: misma categoría, 5 min window (Redis key, TTL 5 min)
- Quiet hours: 23:00-07:00 zona horaria del usuario (se reutiliza `User.timezone` + `safeTimeZone`)
- Contratos vía `@nestjs/swagger` (Constitución III)
- Sin N+1 en el dispatcher (1 query por dispatch para obtener pet + AiConfig + prefs)

**Scale/Scope**: ~1000-5000 usuarios activos; 3 notificaciones/día × 1000 users = ~3000 LLM calls/día (aceptable, 50 tokens c/u = 150k tokens)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cumplimiento |
|-----------|-------------|
| I. Backend autoritativo | ✅ `userId`/`petId` de sesión/eventos internos; `notificationPrefs` validado con Zod; rate limit en servidor |
| II. Combate determinista | ✅ N/A (no afecta el motor de combate) |
| III. Consistencia multi-plataforma | ✅ Contratos vía `@nestjs/swagger` → `openapi.json`; `notifications.json` en `shared/game-data/` |
| IV. Lazy tick | ✅ Se reutiliza el lazy tick para detectar vitales críticas; no se crea cron por pet |
| V. Realtime | ✅ WS `pet:notification` vía `RealtimeGateway.emitToUser`, no polling |
| VI. Motores puros testeables | ✅ `notification-rules.ts` (quiet hours, rate limit, dedup) sin dependencias de Nest |
| VII. Balance data-driven | ✅ `notifications.json` y thresholds en `shared/game-data/`; no literales |
| VIII. Seguridad | ✅ `notificationPrefs` validado con Zod; LLM timeout; no expone secrets; `AiUsage` no se incrementa |
| IX. Simplicidad primero | ✅ No se crea cola BullMQ; Redis counter + dedup es suficiente; no push mobile en v1 |

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/007-pet-notifications/
├── spec.md              # Feature specification
├── plan.md              # This file
├── tasks.md             # Task list
└── contracts/
    └── api-contract.md  # REST + WS contracts
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── modules/
│   │   └── notifications/
│   │       ├── notifications.module.ts
│   │       ├── notification-rules.ts           # Motor puro: quiet hours, rate limit, dedup
│   │       ├── notification-rules.spec.ts      # Tests unitarios del motor
│   │       ├── notification-generator.service.ts  # Genera texto (IA o plantilla)
│   │       ├── notification-dispatcher.service.ts # Decide SI notificar
│   │       ├── notification-dispatcher.spec.ts
│   │       └── dto/
│   │           └── notification-prefs.dto.ts
│   ├── users/
│   │   ├── users.controller.ts   # PATCH /me ampliado
│   │   └── users.service.ts      # Update notificationPrefs
│   └── app.module.ts             # Registrar NotificationsModule

prisma/
├── schema.prisma                 # User.notificationPrefs Json?
└── migrations/                   # add_notification_prefs

shared/game-data/
└── notifications.json           # Plantillas personality × tier × category

desktop/
├── src/
│   ├── components/
│   │   └── NotificationSettingsPanel.svelte
│   ├── lib/
│   │   ├── notification-handler.ts    # WS listener → Tauri notification
│   │   └── notification-inbox.ts      # Inbox offline
│   └── main.ts                    # Register WS listener
└── src-tauri/
    └── tauri.conf.json           # notification plugin config (si no existe)
```

**Structure Decision**: Se sigue el patrón de `modules/bonding/` (feature 006): módulo de dominio propio con motor puro (`notification-rules.ts`) + servicio de orquestación. El frontend Tauri consume el WS event y lo entrega al plugin nativo.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Sin violaciones. No se requiere justificación.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Riesgos y decisiones

| # | Decisión | Alternativa descartada | Razón |
|---|----------|------------------------|-------|
| 1 | Redis counter para rate limit | Tabla `NotificationLog` en PostgreSQL | Redis más rápido para counter+TTL; no hace falta persistir en BD (efímero 24h). |
| 2 | Dedup por key Redis (5 min TTL) | Dedup en memoria (Map) | Multi-instance: Redis es shared; en memoria fallaría con scaling. |
| 3 | 1 LLM call por evento, 50 tokens, sin retry | Multiple calls por intención | FR-008: máx 1 call; coste 150k tokens/día aceptable. |
| 4 | `notifications.json` en `shared/game-data/` | Plantillas hardcoded en servicio | Constitución VII: datos en JSON versionable. |
| 5 | `notificationPrefs` como `Json?` en User | Tabla `NotificationPrefs` separada | 1 user = 1 prefs; campo JSON suficiente, evita join. |
| 6 | Quiet hours usa `User.timezone` + `safeTimeZone` | Config global | Cada usuario tiene su zona; reutiliza `sleep-cycle.ts`. |
| 7 | No se incrementa `AiUsage` por notificaciones | Incluir en cuota | 50×3/día = 150 tokens; trivial vs chat. |

## Notas para implementer

- `RealtimeGateway.emitToUser(userId, event, payload)` **ya existe** (namespace `realtime`); reutilizarlo para `pet:notification`.
- `AiModule` ya tiene el mecanismo de LLM call; se reutiliza con `max_tokens=50`, `timeout=5000`.
- `GameDataService.getBalance()` **ya carga** JSON de `shared/game-data/`; se extiende para `notifications.json`.
- `RedisModule` (ioredis) **ya está disponible**; se inyecta en `NotificationDispatcherService`.
- `User.timezone` **ya existe**; `safeTimeZone` en `sleep-cycle.ts` ya valida zonas horarias.
- `PATCH /me` **ya existe** en `users.controller.ts`; se extiende el DTO con `notificationPrefs`.
- El Tauri notification plugin **ya está configurado** en el escritorio.
- Los eventos que disparan notificaciones **ya emiten** vía `EventEmitterModule`; se suscribe el dispatcher.
- `version` de `balance.json` se incrementa si se añaden thresholds de vitales críticas.