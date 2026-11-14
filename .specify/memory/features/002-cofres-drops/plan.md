# Implementation Plan: Cofres y drops aleatorios

**Branch**: `002-cofres-drops` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `002-cofres-drops/spec.md`

**Note**: Este plan es la salida del commando `/speckit-plan`; define el diseño técnico antes de la generación de tareas.

## Summary

**Requisito principal**: Implementar el sistema de cofres (Bronce, Plata, Oro, Diamante, Mítico) con tablas de drops data-driven en `balance.json → chests`, resolución autoritativa en servidor usando `crypto.randomInt`, garantía de pity por tipo de cofre, compra directa con monedas/gemas, historial de aperturas y notificación en tiempo real vía WebSocket.

**Enfoque técnico**: Módulo NestJS `chests` con un `DropEngineService` puro (sin dependencias de Nest) que realiza el weighted roll sobre la tabla de drops. La apertura usa una transacción Prisma atómica (`$transaction`) con `updateMany` + condición para idempotencia (pattern heredado de `hatching.service.ts`). El pity se persiste en una nueva tabla `ChestPity` independiente de `PityCounter`. Los cofres se crean asincrónicamente mediante BullMQ (`chests:create` job) para no bloquear la acción que los dispara.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 24 LTS

**Primary Dependencies**: NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `@nestjs/swagger`), Prisma ORM 6.4, `crypto` (Node.js built-in), `ioredis` 5.11 (Redis + BullMQ)

**Storage**: PostgreSQL 18 (vía Prisma ORM — modelos `Chest`, `ChestPity` nuevos; `User`, `InventoryItem`, `Item` existentes), Redis 8 (colas BullMQ para jobs `chests:create` / `chests:cleanup`)

**Testing**: Jest 29 (unitario con `.spec.ts` co-located), Supertest (E2E en `backend/test/*.e2e-spec.ts`), simulaciones de 100k aperturas para validar balance (DevKit)

**Target Platform**: Linux server (Docker — `docker-compose.yml` con Postgres + Redis)

**Project Type**: web-service (backend autoritativo REST + WebSocket)

**Performance Goals**: <50ms p95 para `GET /chests` (listado), <300ms p95 para `POST /chests/open` (incluye resolución de drops + transacción de inventario + pity)

**Constraints**: Aleatoriedad determinista con `crypto.randomInt` (nunca `Math.random`); drops definidos exclusivamente en `balance.json → chests` (data-driven, sin hardcoded); transacciones atómicas para idempotencia (anti race-condition); rate limiting existente del backend aplica a endpoints de compra

**Scale/Scope**: 10 000 usuarios concurrentes, ~5 000 aperturas/min en peak de evento; 5 tipos de cofre × ~20-40 items por tabla de drop; 30 días de retención de cofres no abiertos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Artículo | Requisito | Veredicto | Justificación |
|----------|-----------|-----------|---------------|
| **I. Backend autoritativo** | Toda aleatoriedad en servidor con `crypto.randomInt`; transacciones atómicas; userId desde sesión JWT | ✅ PASS | `DropEngineService` usa `crypto.randomInt` para el weighted roll; `chests.service.ts` usa `$transaction` con `updateMany` + condición (idempotencia); `@CurrentUser` extrae `userId` del JWT |
| **II. Combate determinista** | PRNG privado fijo, orden de llamadas estable | N/A | El motor de drops es un one-shot roll (no multi-turno como combate); usa `crypto.randomInt` directamente. El orden de resolución por tier es fijo: se itera de menor a mayor |
| **III. Consistencia multi-plataforma** | Contrato único `openapi.json`; datos en `shared/game-data/*.json` | ✅ PASS | Endpoints definidos con `@nestjs/swagger`; tabla de drops en `shared/game-data/balance.json → chests`; clientes consumen tipos generados |
| **IV. Tick perezoso** | No usar colas para lo que no necesita asincronía | ✅ PASS | Jobs `chests:create` y `chests:cleanup` sí requieren asincronía (trigger no bloquea, cron diario). No se itera cofres en requests |
| **VIII. Seguridad** | Rate limiting; validación estricta; Bearer JWT | ✅ PASS | Reutiliza pipeline de auth existente; Zod valida body; `type`/`paymentMethod` validados contra whitelist; rate limit global aplica |
| **IX. Simplicidad primero** | YAGNI; menos deps/tablas | ✅ PASS | No introduce nuevas deps npm; 2 modelos Prisma nuevos son mínimos; motor de drops es un module puro sin DI (patrón `battles/combat/engine.ts`) |

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/002-cofres-drops/
├── plan.md              # Este archivo (salida de /speckit-plan)
├── research.md          # Salida Phase 0 (pendiente)
├── data-model.md        # Salida Phase 1 (pendiente)
├── quickstart.md        # Salida Phase 1 (pendiente)
├── contracts/
│   └── api-contract.md  # Contrato REST + WebSocket (entregado con este plan)
└── tasks.md             # Salida Phase 2 (/speckit-tasks — NO creado por /speckit-plan)
```

### Source Code (repository root)

```text
backend/src/modules/chests/
├── chests.module.ts              # NestJS Module: importa PrismaModule, RedisModule, GameDataModule, RealtimeModule
├── chests.controller.ts          # Endpoints REST: GET /chests, POST /chests/open, POST /chests/purchase, GET /chests/history
├── chests.service.ts             # Orquestación: transacción de apertura, compra (saldo + límite día), historial
├── drop-engine.service.ts        # Motor puro de weighted roll (sin DI de Nest; recibe tabla + rng como args)
├── chest-pity.service.ts         # Gestión de pity: read/increment/reset con Prisma
├── chests.processor.ts           # BullMQ processor: job chests:create (asíncrono), job chests:cleanup (30d)
└── dto/
    ├── chest.dto.ts              # Response DTOs: ChestResponse, ChestListResponse, OpenChestResponse, DropItem, PityProgress
    ├── chest-open.dto.ts         # Request DTO: OpenChestDto { chestId: string }
    ├── chest-purchase.dto.ts     # Request DTO: PurchaseChestDto { type, paymentMethod }
    └── chest-history.dto.ts      # Response DTO: ChestHistoryResponse { openings, total }

shared/game-data/
└── balance.json                  # (modificación) → nueva sección "chests" con tablas de drop por tipo
```

**Structure Decision**: Web-service monolítico NestJS (Opción 2 del template). El backend es el único artefacto que cambia en esta feature; los clientes (Tauri/Svelte, Android/iOS) consumen el contrato OpenAPI generado. El motor de drops sigue el patrón de `modules/battles/combat/engine.ts` — un módulo puro, testable en aislamiento, sin dependencias de Nest para poder simularlo masivamente.

**Cambios en archivos existentes:**

```text
backend/src/app.module.ts              # + import ChestsModule
backend/prisma/schema.prisma          # + model Chest, + model ChestPity, + relaciones en User
shared/game-data/balance.json         # + section "chests" (tablas de drop, precios, pity config)
```

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| N/A — Sin violaciones detectadas | — | — |

---

### Notas de diseño (appendix)

**Orden de resolución del drop (fijo, para tests):**
1. Seleccionar tier con weighted roll: se itera tiers `[common, uncommon, rare, epic, legendary]` de menor a mayor, cada uno con su peso relativo (normalizado). Se usa un solo `crypto.randomInt(0, totalWeight)` y se acumula hasta el tier ganador.
2. Seleccionar item dentro del tier: `crypto.randomInt(0, itemsInTier.length)` sobre la lista de items mapeados a ese tier.
3. Resolver qty: `crypto.randomInt(qtyMin, qtyMax + 1)` del rango definido para ese item.
4. Aplicar pity: si `ChestPity.count >= threshold` y el tier resultante < `minTier`, se re-roll (paso 1-3) forzando tier >= `minTier`. Si el drop natural ya cumple `minTier`, se resetea pity a 0.

**Patrón de idempotencia (apertura):**
```ts
// chests.service.ts — abrirCofre
const claimed = await tx.chest.updateMany({
  where: { id: chestId, userId, openedAt: null },
  data: { openedAt: now },
});
if (claimed.count === 0) {
  // → 404 si no existe / 409 si ya abierto
}
```

**Límite de compras/día:**
Se consulta `Chest.count` con `WHERE userId = ? AND source = 'purchase' AND createdAt >= startOfDay(timezone)`; si >= 5 → `409`. Se usa el `timezone` del usuario para calcular la medianoche local.

**Caché de drop tables:**
Las tablas de `balance.json → chests` se cargan una vez al inicio en `GameDataModule` (ya existente) y se sirven desde memoria. Redis se usa exclusivamente para BullMQ (jobs `chests:create`, `chests:cleanup`).