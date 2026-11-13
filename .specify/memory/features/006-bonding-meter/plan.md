# Implementation Plan: Bonding Meter (Métrico de Vínculo)

**Branch**: `006-bonding-meter` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/memory/features/006-bonding-meter/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Métrico de vínculo jugador-pet (0-100) que sube con interacciones variadas (feed, battle, minigame, chat, clean, sleep, evolve) y decae gradualmente si el jugador lo abandona >48h, con cinco rangos (Acostumbrado → Compañero → Aliado → Alma gemela → Leyenda). El vínculo desbloquea comportamiento de la IA (saludo, memoria, reacciones emocionales) y recompensas visuales (patrón exclusivo, duerme cerca del cursor) por umbral.

**Enfoque técnico**:
- El vínculo es un **estado derivado del tiempo y de eventos**, no un job: el incremento se resuelve en el backend dentro de las acciones existentes (`feed`, `battle`, `minigame`, `chat`, `clean`, `sleep`, `evolve`) y el decaimiento dentro del `applyLazyTick` ya existente de `pets.service.ts` (Constitución IV/IX — sin cron/cola por pet).
- Nuevo módulo de dominio `backend/src/modules/bonding/` (NestJS) con un motor puro `bonding.ts` (fórmula de tier, cap/floor, decaimiento, redondeo — sin dependencias de Nest, testeable en aislamiento, patrón de `personality.ts`) + `BondingService` (orquesta Prisma + `GameDataService` + `RealtimeGateway`).
- Nuevos campos en `Pet` (`bonding`, `bondingTier`, `lastInteractionAt`) + nueva tabla `BondingEvent` (auditoría por cambio). Migración Prisma.
- Constantes jugables en `shared/game-data/balance.json → bonding` (`interactions`, `decayRatePerDay`, `tiers[]`), leídas vía `GameDataService.getBalance()` (Constitución VII) — cambiar el balance no toca el motor.
- Integración con la IA: `bondingTier` se inyecta en `buildSystemPrompt` y el recuerdo de `PetMemory` se habilita con `bondingTier >= ally` **OR** `intelligence >= MEMORY_UNLOCK` (idempotente) en `chat.service.ts`.
- Eventos en tiempo real por Socket.IO (`bonding:tier_up`, `bonding:tier_down`, `bonding:decay`) vía `RealtimeGateway.emitToUser` (Constitución V).
- Contratos REST `GET /pets/:id` (ampliado) y `GET /pets/:id/bonding`, documentados con `@nestjs/swagger` → `shared/openapi/openapi.json`.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS

**Primary Dependencies**: NestJS 11, Prisma ORM, @nestjs/event-emitter (ya registrado), @nestjs/schedule (ya registrado), socket.io 4.8, @nestjs/jwt + passport-jwt, @nestjs/swagger

**Storage**: PostgreSQL (vía Prisma ORM) — tabla `Pet` (ampliada) y `BondingEvent` (nueva); Redis no es requerido para esta feature (el decaimiento es lazy, no hay colas)

**Testing**: Jest (unitarios `.spec.ts` junto al motor `bonding.ts` y `BondingService`), Supertest (E2E en `backend/test/`)

**Target Platform**: Linux server (Docker) — `docker-compose.yml` con Postgres (+ mock de LLM para tests de IA)

**Project Type**: web-service (REST + WebSocket API autoritativo)

**Performance Goals**: <100ms p95 para `GET /pets/:id` y `GET /pets/:id/bonding` (SC-001); el tick con decaimiento añade <5ms sobre el `applyLazyTick` ya existente (una sola query extra opcional, sin N+1)

**Constraints**:
- Backend autoritativo (Constitución I): toda la matemática del vínculo (incremento, cap/floor, tier, decaimiento) se resuelve en el servidor; `userId`/`petId` salen de `@CurrentUser`, nunca del cuerpo; `type` de interacción validado contra `balance.bonding.interactions`.
- Lazy tick (Constitución IV): el decaimiento vive dentro de `applyLazyTick`, idempotente (re-fija la base de referencia tras aplicar); no se itera pets con `setInterval`.
- Balance data-driven (Constitución VII): sin literales; `+2/+3/+0.5/0.5` y `decayRatePerDay` y `tiers[]` provienen de `balance.json`.
- Motor puro sin dependencias de Nest (Constitución VI/IX): `bonding.ts` testable en aislamiento.
- Transacción atómica (Constitución I): incremento + `BondingEvent` + `lastInteractionAt` en un `$transaction`; el tipo de interacción ya viene resuelto por la acción disparadora, por lo que no hay doble-count por race en la misma acción.
- IA con mínima confianza (Constitución VIII): `bondingTier` es una señal de contexto; el prompt base (rasgo + mood) nunca se altera por el modelo, solo se le añade contexto por umbral.
- YAGNI (Constitución IX): no se crea infraestructura nueva (colas, scheduler) — se reutiliza lo que ya existe.

**Scale/Scope**: 10k usuarios concurrentes; 1 pet típico por usuario → ~10k `Pet`; `BondingEvent` crece ~1-10 filas por interacción por pet/día (≈ 100k-1M filas/mes) con índice `[petId, createdAt]`; el historial paginado limita el volumen de lectura.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Artículo | Requisito | Cumple | Evidencia |
|----------|-----------|--------|-----------|
| **I. Backend autoritativo** | Toda la matemática en servidor; `userId`/`petId` de sesión; transacción atómica | ✅ | `BondingService.recordInteraction` y el decaimiento del tick usan Prisma `$transaction`; `type` validado contra `balance.bonding.interactions`; los controllers pasan `@CurrentUser`, nunca `userId` del body |
| **II. Combate determinista** | No aplica directamente | ✅ (N/A) | El vínculo no añade aleatoriedad; `battle` solo dispara `recordInteraction(+3)` determinista |
| **III. Contrato único** | Endpoints vía `@nestjs/swagger`; clientes generados | ✅ | `GET /pets/:id/bonding` documentado con DTOs; `pnpm export:openapi` regenera `openapi.json` |
| **IV. Lazy tick** | Decaimiento dentro de `applyLazyTick`, sin cron/cola por pet | ✅ | Se añade el bloque de decaimiento de vínculo a la pasada ya existente; re-fija `lastInteractionAt`/base de referencia → idempotente |
| **V. WebSocket autenticado** | Push por namespace `realtime`; identidad del JWT | ✅ | `RealtimeGateway.emitToUser(userId, 'bonding:tier_up', ...)`; el gateway ya autentica el handshake |
| **VI. Arquitectura modular** | Dominio `modules/bonding/`; inyección de Prisma/GameData/Realtime; motor puro aislado | ✅ | `modules/bonding/bonding.module.ts` + `BondingService` + motor `bonding.ts` (sin Nest); registrado en `AppModule` |
| **VII. Balance data-driven** | Números en `balance.json → bonding`, vía `GameDataService` | ✅ | `interactions`, `decayRatePerDay`, `tiers[]` leídos de `getBalance().bonding`; sin literales en el motor |
| **VIII. Seguridad** | IA con mínima confianza; contexto no manipula | ✅ | `bondingTier` se inyecta como contexto al `systemPrompt` por umbral; no hay herramienta con efecto nueva; validación estricta del `type` |
| **IX. Simplicidad primero** | Sin infra nueva; reutiliza tick + memoria + realtime | ✅ | No se crea scheduler/cola; se reutiliza `applyLazyTick`, `PetMemory`/`memory.recall` y `RealtimeGateway` |

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/006-bonding-meter/
├── spec.md              # Especificación (user stories, FR, SC)
├── plan.md              # Este archivo
├── tasks.md             # Tareas por user story
└── contracts/
    └── api-contract.md  # Contratos REST + WS + integración
```

### Source Code (repository root)

```text
backend/src/modules/bonding/
├── bonding.module.ts        # [NUEVO] módulo de dominio
├── bonding.service.ts       # [NUEVO] orquesta Prisma + GameData + Realtime
├── bonding.service.spec.ts  # [NUEVO] tests del servicio
├── bonding.ts               # [NUEVO] motor puro (tier, cap/floor, decay)
├── bonding.spec.ts          # [NUEVO] tests del motor puro
└── dto/
    └── bonding.dto.ts       # [NUEVO] DTOs de respuesta para Swagger

backend/src/modules/pets/
├── pets.controller.ts       # [MOD] GET /pets/:id/bonding
└── pets.service.ts          # [MOD] applyLazyTick (decay) + hooks de interacción

backend/src/modules/ai/
├── personality.ts           # [MOD] buildSystemPrompt: inyecta bondingTier
└── chat.service.ts          # [MOD] memoria por bondingTier>=ally OR intelligence

backend/prisma/
└── schema.prisma            # [MOD] Pet.bonding/bondingTier/lastInteractionAt + model BondingEvent

shared/game-data/
└── balance.json             # [MOD] sección bonding { interactions, decayRatePerDay, tiers[] }

shared/openapi/
└── openapi.json             # [REGEN] pnpm export:openapi
```

**Structure Decision**: Se añade un dominio `bonding/` (motor puro + servicio + DTOs) para aislar la fórmula y cumplir VI/IX. El *estado* vive en `Pet` (no en una tabla separada de estado) y la *auditoría* en `BondingEvent`; el decaimiento se integra al `applyLazyTick` existente de `pets/` (IV) y los endpoints se expone desde `pets/` para que `GET /pets/:id` y `GET /pets/:id/bonding` estén colocalizados. La IA se toca mínimamente en `ai/` (inyección de contexto, OR con la memoria existente).

## Modelo de datos (detalle)

**`balance.json → bonding`** (nueva sección, versionable):
```json
{
  "bonding": {
    "interactions": { "feed": 2, "battle": 3, "minigame": 2, "chat": 1, "clean": 1, "sleep": 0.5, "evolve": 5 },
    "decayRatePerDay": 0.5,
    "graceWindowHours": 24,
    "decayStartHours": 48,
    "tiers": [
      { "id": "acquainted", "name": "Acostumbrado", "min": 0,  "max": 29 },
      { "id": "companion",  "name": "Compañero",    "min": 30, "max": 59 },
      { "id": "ally",       "name": "Aliado",       "min": 60, "max": 79 },
      { "id": "soulmate",   "name": "Alma gemela",  "min": 80, "max": 99 },
      { "id": "legend",     "name": "Leyenda",      "min": 100,"max": 100 }
    ]
  }
}
```

**Prisma** (adición a `schema.prisma`):
```prisma
model Pet {
  // ... campos existentes ...
  bonding           Float    @default(0)
  bondingTier       String   @default("acquainted")
  lastInteractionAt DateTime @default(now())
  bondingEvents     BondingEvent[]
}

model BondingEvent {
  id        String   @id @default(uuid())
  petId     String
  pet       Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  delta     Float
  reason    String   // feed | battle | minigame | chat | clean | sleep | evolve | decay
  value     Float
  createdAt DateTime @default(now())
  @@index([petId, createdAt])
}
```

**Fórmula del decaimiento** (resuelta en `applyLazyTick`): `hoursIdle = now − lastInteractionAt`. Si `hoursIdle <= graceWindowHours(24)` → sin decaimiento. Si `> decayStartHours(48)` → `daysEligible = (hoursIdle − 48)/24` y `decay = decayRatePerDay × daysEligible` (redondeado a 2 decimales); `newBonding = clamp(bonding − decay, 0, 100)`. Tras aplicar, se fija la base de referencia para que la siguiente lectura no re-aplique el mismo tramo (idempotencia).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*Sin violaciones. No se requiere justificación.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Riesgos y decisiones

| # | Decisión | Alternativa descartada | Razón |
|---|----------|------------------------|-------|
| 1 | Decaimiento dentro de `applyLazyTick` | Cron/cola por pet para bajar el vínculo | Constitución IV/IX: el tick perezoso ya existe y escala sin jobs; duplicarlo añadiría infraestructura YAGNI. |
| 2 | Estado en `Pet` + auditoría en `BondingEvent` | Tabla `BondingState` separada | 1 pet = 1 vínculo; un campo por pet es suficiente y evita joins; `BondingEvent` cubre el historial/auditoría (SC-003). |
| 3 | `BondingService` propio (dominio) | Meter la lógica en `pets.service.ts` | El servicio de pets ya es grande; el motor puro aislado (VI/IX) facilita test unitario de fórmula/tier/decay. |
| 4 | Memoria por `bondingTier >= ally` OR `intelligence >= MEMORY_UNLOCK` | Dos sistemas de memoria paralelos | Reutiliza `PetMemory`/`memory.recall` (ya existe); evita duplicar el bloque (idempotente). |
| 5 | Patrón exclusivo reutiliza catálogo `Pattern` | Nueva entidad de patrón exclusivo | El patrón 100 se marca desbloqueado del catálogo existente; no se modela una entidad nueva. |

## Notas para implementer

- `applyLazyTick` **ya existe** en `pets.service.ts` (línea ~268); añadir el bloque de decaimiento de vínculo al final, antes de `pet.update`.
- Las acciones `feed`/`clean` **ya existen** y emiten eventos (`pet:fed`, `pet:cleaned`); `battle`/`minigame`/`chat`/`sleep`/`evolve` resuelven en sus servicios. El hook de vínculo se inyecta donde cada acción termina exitosamente (o vía evento de dominio reutilizable, p. ej. `pet:fed`).
- `buildSystemPrompt(pet, owner, { tier, now, timeZone })` **ya existe** en `personality.ts`; `chat.service.ts` ya inyecta `memory.recall` cuando `intelligence >= MEMORY_UNLOCK` — extender esa condición con `bondingTier >= ally`.
- `RealtimeGateway.emitToUser(userId, event, payload)` **ya existe** (namespace `realtime`); reutilizarlo para `bonding:*`.
- `GameDataService.getBalance()` **ya carga** `balance.json`; añadir `bonding` a la sección y a cualquier tipo/schema Zod de validación.
- La identidad llega vía `@CurrentUser` en `pets.controller.ts`; el `GET /pets/:id/bonding` nuevo debe reusar esa guard y no aceptar `userId` en el body.
- `version` de `balance.json` se incrementa al añadir la sección `bonding` (Constitución VII).