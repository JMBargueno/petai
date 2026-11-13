# Implementation Plan: Misiones y desafíos diarios/semanales

**Branch**: `001-misiones-diarias` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/memory/features/001-misiones-diarias/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Sistema de misiones diarias (3–5) y semanales (5–7) que ancla el login diario de PetAI, conecta todos los sistemas del juego (cuidado, minijuegos, Arena, IA) mediante un bucle cohesivo de progresión, y desbloquea un cofre diario al completar todas las misiones del día. Las misiones se generan dinámicamente con selección ponderada y anti-repetición (máx. 3 días consecutivos sin repetir combinación), se trackean en tiempo real vía eventos de dominio, y se resetean por timezone local con un scheduler lazy (sin colas).

**Enfoque técnico**:
- Módulo NestJS `missions/` con 4 servicios (orquestación, generación, tracking, scheduler) y 1 controller REST.
- Modelo Prisma `Mission` (ya existe en schema) con índices compuestos para queries por período.
- Redis para contadores en caliente y anti-repetición (fallback a PG si Redis no está).
- Eventos de dominio (`pet:fed`, `battle:finished`, etc.) vía `@nestjs/event-emitter` → `MissionTrackingService` actualiza progreso sin bloquear la acción principal.
- Cron `@nestjs/schedule` cada 5 min para detectar resets por timezone (lazy, sin jobs por usuario).
- WebSocket `mission:progress` / `mission:completed` / `mission:daily_complete` emitidos vía `RealtimeGateway.emitToUser()`.
- Recompensas acreditadas con transacción atómica (`updateMany` + condición) para evitar duplicación bajo race condition.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS

**Primary Dependencies**: NestJS 11, Prisma ORM 6.4, ioredis 5.11, @nestjs/schedule, @nestjs/event-emitter, @nestjs/jwt, passport-jwt, socket.io 4.8

**Storage**: PostgreSQL 18 (vía Prisma ORM), Redis 8 (ioredis, tolerante a fallos con fallback a PG)

**Testing**: Jest (unitarios `.spec.ts` junto al código), Supertest (E2E en `backend/test/`)

**Target Platform**: Linux server (Docker) — `docker-compose.yml` con Postgres + Redis

**Project Type**: web-service (REST + WebSocket API autoritativo)

**Performance Goals**: <100ms p95 para `GET /missions` (SC-001: <2s total incluyendo red); <2s para `mission:progress` en la UI (SC-003)

**Constraints**:
- Backend es autoritativo: toda generación de misiones, aleatoriedad (`crypto.randomInt`), y acreditación de recompensas se resuelve en el servidor.
- Lazy tick pattern: el scheduler no agenda jobs individuales por usuario; detecta en lote (take: 100) cada 5 min.
- Transacciones atómicas (`updateMany` + condición) para reclamos: dos peticiones concurrentes no duplican recompensa.
- `userId` siempre proviene de `@CurrentUser` (JWT), nunca de un parámetro del cliente.
- Listener de eventos no bloquea la acción principal (se procesa asíncronamente vía `@OnEvent`).
- Redis es un acelerante, no un requisito: si falla, se recurre a PostgreSQL.

**Scale/Scope**: 10k concurrentes usuarios; ~5 misiones diarias promedio/usuario → ~50k misiones activas en PG; scheduler procesa lotes de 100 cada 5 min.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Artículo | Requisito | Cumple | Evidencia |
|----------|-----------|--------|-----------|
| **I. Backend autoritativo** | Toda aleatoriedad en servidor; transacciones atómicas; `userId` desde sesión | ✅ | `mission-generation.service.ts` debe usar `crypto.randomInt`; `claimReward` usa `updateMany` + condición `claimed: false`; `userId` siempre de `@CurrentUser` |
| **II. Combate determinista** | No aplica directamente | ✅ N/A | El listener de `battle:finished` solo incrementa un contador; no modifica el engine |
| **III. Contrato único** | `@nestjs/swagger` → `shared/openapi/openapi.json` | ✅ | Controller expone DTOs con `@ApiProperty`; se regenera OpenAPI con `pnpm export:openapi` |
| **IV. Balance en JSON** | Configuración en `shared/game-data/missions.json` | ✅ | `missions.json` existe con `minCount`, `maxCount`, `types[]` con `weight`, `target`, `reward` |
| **V. Seguridad** | JWT + `@nestjs/passport`; validación con `zod` | ✅ | Se reutiliza `AuthGuard` (JWT) existente; no se introducen nuevos vectores de ataque |
| **VI. Deterioro lazy tick** | No aplica directamente | ✅ N/A | El pattern "no agendar por usuario" se respeta en el scheduler |
| **VII. UI consume contrato** | La UI consume el API sin re-calcular | ✅ | El controller expone todo lo que la UI necesita; el cliente no calcula progreso ni recompensas |
| **VIII. Seguridad adicional** | `helmet`; rate limiting; no exfiltración | ✅ | Rate limiting vía Redis; queries siempre filtran por `userId` de la sesión |
| **IX. YAGNI / Fases** | No introducir infraestructura innecesaria | ✅ | `@nestjs/schedule` (in-process) no BullMQ; se stubea el cofre si Feature #2 no existe |

**Veredicto**: PASS — Sin violaciones de constitución. El plan cumple los 9 artículos.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/001-misiones-diarias/
├── spec.md              # Feature specification (input)
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api-contract.md  # Phase 1 output: REST + WebSocket contract
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   └── schema.prisma                  # [EXISTENTE] — Mission model ya definido
├── src/
│   ├── app.module.ts                  # [MODIFICAR] — Registrar MissionsModule + ScheduleModule + EventEmitterModule
│   ├── main.ts                        # [EXISTENTE] — Sin cambios
│   ├── config/
│   │   └── env.config.ts              # [EXISTENTE] — Sin cambios
│   ├── prisma/
│   │   ├── prisma.module.ts           # [EXISTENTE] — Exporta PrismaService (@Global)
│   │   └── prisma.service.ts          # [EXISTENTE]
│   ├── redis/
│   │   ├── redis.module.ts            # [EXISTENTE] — @Global, exporta RedisService
│   │   └── redis.service.ts           # [EXISTENTE]
│   ├── modules/
│   │   ├── game-data/
│   │   │   ├── game-data.module.ts    # [EXISTENTE] — GameDataService.getMissions()
│   │   │   └── game-data.service.ts   # [EXISTENTE]
│   │   ├── realtime/
│   │   │   ├── realtime.module.ts     # [EXISTENTE]
│   │   │   └── realtime.gateway.ts    # [EXISTENTE] — emitToUser()
│   │   ├── auth/                      # [EXISTENTE] — AuthGuard reutilizado
│   │   └── ...                        # pets, battles, ai, etc.
│   └── missions/                      # [MÓDULO — esta feature]
│       ├── missions.module.ts         # [NUEVO] NestJS Module
│       ├── missions.controller.ts     # [NUEVO] REST endpoints
│       ├── missions.service.ts        # [EXISTENTE] Orquestación: listar, claim, summary, streaks
│       ├── mission-generation.service.ts  # [EXISTENTE] Generación ponderada + anti-repetición
│       ├── mission-tracking.service.ts    # [EXISTENTE] Listener eventos → progreso
│       ├── mission-scheduler.service.ts   # [EXISTENTE] Cron: reset diario/semanal + cleanup
│       ├── missions.service.spec.ts           # [NUEVO] Tests
│       ├── mission-generation.service.spec.ts # [NUEVO] Tests
│       ├── mission-tracking.service.spec.ts   # [NUEVO] Tests
│       ├── mission-scheduler.service.spec.ts  # [NUEVO] Tests
│       ├── missions.controller.spec.ts        # [NUEVO] Tests
│       └── dto/
│           ├── mission.dto.ts         # [EXISTENTE] MissionProgressEvent, MissionCompletedEvent
│           └── mission-claim.dto.ts   # [NUEVO] Claim + Swagger DTOs
├── test/
│   ├── missions.e2e-spec.ts               # [NUEVO] E2E full flow
│   └── ...
└── package.json                         # [MODIFICAR] — @nestjs/schedule, @nestjs/event-emitter

shared/
└── game-data/
    └── missions.json                    # [EXISTENTE] — Config: tipos, pesos, recompensas
```

**Structure Decision**: Estructura **web-service** del monorepo. El módulo `missions/` vive en `backend/src/missions/` (nivel top-level, no dentro de `modules/`) porque interactúa con múltiples subsistemas (pets, battles, AI, minigames). Los DTOs van en subdirectorio `dto/`. Tests unitarios junto al código; E2E en `backend/test/`.

## Plan de implementación — Pasos concretos

### Paso 1: Dependencias y registro de módulo

**`backend/package.json`** — Añadir a `dependencies`:
```json
"@nestjs/schedule": "^6.0.0",
"@nestjs/event-emitter": "^3.0.0"
```

**`backend/src/missions/missions.module.ts`** — [NUEVO]
```typescript
@Module({
  imports: [PrismaModule, RedisModule, GameDataModule, RealtimeModule],
  controllers: [MissionsController],
  providers: [MissionsService, MissionGenerationService, MissionTrackingService, MissionSchedulerService],
  exports: [MissionsService],
})
export class MissionsModule {}
```

**`backend/src/app.module.ts`** — Registrar `ScheduleModule.forRoot()`, `EventEmitterModule.forRoot()`, `MissionsModule`.

### Paso 2: Controller REST

**`backend/src/missions/missions.controller.ts`** — [NUEVO]
- `@Controller('missions')` con `@UseGuards(AuthGuard)`.
- `GET /` → `missionsService.getMissions(@CurrentUser() user)`
- `GET /summary` → `missionsService.getSummary(@CurrentUser() user)`
- `GET /:id` → `missionsService.getMissionById(@CurrentUser() user, :id)`
- `POST /:id/claim` → `missionsService.claimReward(@CurrentUser() user, :id)`

### Paso 3: DTOs para Swagger

**`backend/src/missions/dto/mission-claim.dto.ts`** — [NUEVO]
- `MissionResponseDto` — respuesta de `GET /missions`
- `ClaimRewardResponseDto` — respuesta de `POST /missions/:id/claim`
- `MissionSummaryResponseDto` — respuesta de `GET /missions/summary`

### Paso 4: Tests unitarios (5 archivos `.spec.ts`)

- `missions.service.spec.ts`: claim atómico (race), 404, streaks
- `mission-generation.service.spec.ts`: anti-repetición, ponderado, timezone DST
- `mission-tracking.service.spec.ts`: mapeo evento→tipo, emit WS throttle
- `mission-scheduler.service.spec.ts`: batch, no duplica, cleanup
- `missions.controller.spec.ts`: 401 sin token, 200, routing

### Paso 5: Test E2E

**`backend/test/missions.e2e-spec.ts`** — [NUEVO]
Flujo completo: registro → login → pet → `GET /missions` (lazy init) → feed → `mission:progress` WS → completar diarias → `dailyChestUnlocked` → claim → race condition (2 claims simultáneos) → reset por timezone.

### Paso 6: Exportar OpenAPI

`pnpm export:openapi` → `shared/openapi/openapi.json` con endpoints de misiones.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Sin violaciones. No se requiere justificación.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Riesgos y decisiones

| # | Decisión | Alternativa descartada | Razón |
|---|----------|------------------------|-------|
| 1 | `@nestjs/schedule` (in-process cron) | BullMQ (queue externa) | 10k usuarios, 1 scheduler. BullMQ añade infraestructura innecesaria (YAGNI). Migrable en fase de escala. |
| 2 | `crypto.randomInt()` en generación | `Math.random()` | Constitución I exige aleatoriedad criptográficamente segura del servidor. |
| 3 | Stubeo del cofre diario (recompensa fija) | Bloquear hasta Feature #2 | No se puede bloquear toda la feature por una dependencia. Se deja stub que Feature #2 reemplaza. |
| 4 | Scheduler con `take: 100` (paginación) | Procesar todos a la vez | 10k usuarios × query = sobrecarga. Lotes de 100 cada 5 min ≈ 50 ciclos; cada ciclo es rápido. |

## Notas para implementer

- El `Mission` model en Prisma **ya existe** (`schema.prisma` line 298-319); no requiere migración.
- El `missions.json` **ya existe** en `shared/game-data/`; no requiere creación.
- El `GameDataService.getMissions()` **ya soporta** `missions.json`; no requiere modificación.
- El `RedisService` es `@Global()`; se inyecta directamente sin import en el módulo.
- El `RealtimeGateway` es global (en `RealtimeModule`); se inyecta directamente.
- La relación `missions Mission[]` **ya existe** en el modelo `User` (line 33 del schema).
- El evento `pet:level_up` no se emite actualmente por ningún servicio; debe asegurarse de que `pets.service.ts` lo emita cuando un pet sube de nivel.
- `mission-generation.service.ts` usa `Math.random()` en `randomInt()`: **debe reemplazarse por `crypto.randomInt()`** para cumplir Constitución I.

