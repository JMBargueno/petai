---

description: "Lista de tareas para la implementación de la feature Cofres y Drops Aleatorios"
---

# Tasks: Cofres y Drops Aleatorios

**Input**: Design documents from `.specify/memory/features/002-cofres-drops/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), contracts/api-contract.md

**Tests**: El spec.md define acceptance scenarios por story y success criteria medibles (SC-001 a SC-006) que requieren tests de integración y simulación. Se incluyen tasks de test para cada user story.

**Organization**: Tasks grouped by user story para implementación y testing independiente de cada historia.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `shared/`
- Backend NestJS monolítico; `shared/game-data/` para datos de balance
- Tests en `backend/test/*.e2e-spec.ts` y unitarios co-located `*.spec.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estructura base del módulo y DTOs compartidos

- [ ] T001 Crear estructura de directorios `backend/src/modules/chests/` con subdirectorio `dto/`
- [ ] T002 [P] Crear `backend/src/modules/chests/dto/chest.dto.ts` con response DTOs: `ChestResponse`, `ChestListResponse`, `OpenChestResponse`, `DropItem`, `PityProgress` (campos según `contracts/api-contract.md`)
- [ ] T003 [P] Crear `backend/src/modules/chests/dto/chest-open.dto.ts` con `OpenChestDto { chestId: string }` (validación class-validator: `@IsUUID`)
- [ ] T004 [P] Crear `backend/src/modules/chests/dto/chest-purchase.dto.ts` con `PurchaseChestDto { type: 'bronze'|'silver'|'gold', paymentMethod: 'coins'|'gems' }` (validación `@IsIn`)
- [ ] T005 [P] Crear `backend/src/modules/chests/dto/chest-history.dto.ts` con `ChestHistoryResponse { openings: OpeningRecord[], total: number }`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura crítica que DEBE estar completa antes de cualquier user story

**⚠️ CRITICAL**: No user story puede comenzar hasta completar esta fase

- [ ] T006 Modificar `backend/prisma/schema.prisma`: añadir `model Chest` (id uuid, userId, type String, source String, openedAt DateTime?, drops Json?, createdAt DateTime + `@@index([userId, openedAt])`) y `model ChestPity` (id uuid, userId, tier String, count Int @default(0) + `@@unique([userId, tier])`). Añadir relaciones `chests Chest[]` y `chestPity ChestPity[]` en `User`. Ejecutar `npx prisma migrate dev --name add-chests-and-chest-pity`
- [ ] T007 [P] Crear sección `"chests"` en `shared/game-data/balance.json` con: por cada tipo (bronze, silver, gold, diamond, mythic) → `dropTable` (array de `{ itemId, tier, qtyMin, qtyMax }`), `tierWeights` (common: N, uncommon: N, rare: N, epic: N, legendary: N), `pity: { threshold: N, minTier: "string" }`, `prices: { coins: N, gems: N }`; más `rewardConfig: { missionReward: { type, probability }, battleReward: { type, probability } }` y `maxPurchasesPerDay: 5`, `expiryDays: 30`
- [ ] T008 Implementar `backend/src/modules/chests/chests.module.ts` (NestJS Module `@Module` importando `PrismaModule`, `RedisModule`, `GameDataModule`, `RealtimeModule`; controllers: `[ChestsController]`; providers: `[ChestsService, DropEngineService, ChestPityService, ChestsProcessor]`). Registrar en `backend/src/app.module.ts` con `imports: [..., ChestsModule]`
- [ ] T009 Implementar `backend/src/modules/chests/drop-engine.service.ts`: motor puro de weighted roll. Firma: `resolveDrop(dropTable: ChestDropTable, tierWeights: Record<Tier, number>, rng: () => number, qtyRange: (item: DropEntry) => [number, number]): DropResult`. Lógica: (1) calcular totalWeight, (2) `crypto.randomInt(0, totalWeight)` + acumulación para tier, (3) `crypto.randomInt(0, itemsInTier.length)` para item, (4) `crypto.randomInt(qtyMin, qtyMax + 1)` para qty. **Sin `@Injectable` ni DI de Nest** — patrón de `backend/src/modules/battles/combat/engine.ts`
- [ ] T010 [P] Implementar `backend/src/modules/chests/chest-pity.service.ts`: `@Injectable()` con `PrismaService`. Métodos: `getPity(userId, tier)` (find-or-create), `incrementPity(userId, tier)` (upsert increment), `resetPity(userId, tier)` (upsert set count=0)
- [ ] T011 [P] Implementar `backend/src/modules/chests/chests.processor.ts`: `@Processor('chests')` con: (1) `@Worker('chests:create')` → crea `Chest` en BD + emite WS `chest:unlocked`; (2) `@Worker('chests:cleanup')` → cofres > 30 días con `openedAt = null` → coins + `delete`

**Checkpoint**: Fundación lista — implementación de user stories puede comenzar

---

## Phase 3: User Story 1 - Ver mis cofres no abiertos (Priority: P1) 🎯 MVP

**Goal**: El jugador ve su grid de cofres no abiertos, cada uno con tipo, fuente y fecha de creación

**Independent Test**: Crear 1+ `Chest` del usuario (vía job `chests:create` o seed directo) y llamar a `GET /chests` con Bearer token → 200 lista cofres no abiertos; cofres abiertos excluidos

### Tests for User Story 1 ⚠️

> **NOTE: Escribir estos tests PRIMERO, verificar que FALLAN antes de implementación**

- [ ] T012 [P] [US1] Test de integración `GET /chests` en `backend/test/chests.e2e-spec.ts`: (a) usuario con 3 cofres no abiertos (bronze, gold, diamond) + 2 abiertos → 200 `{ chests: [3 items con id, type, source, createdAt] }`, abiertos excluidos; (b) usuario sin cofres → 200 `{ chests: [] }`; (c) sin token → 401; (d) token inválido → 401

### Implementation for User Story 1

- [ ] T013 [US1] Implementar `ChestsService.listChests(userId: string): Promise<ChestListResponse>` en `backend/src/modules/chests/chests.service.ts`: `prisma.chest.findMany({ where: { userId, openedAt: null }, orderBy: { createdAt: 'asc' } })` → mapear a `ChestResponse[]`
- [ ] T014 [US1] Implementar endpoint `@Get('/')` (ruteado a `GET /chests`) en `backend/src/modules/chests/chests.controller.ts` con `@UseGuards(JwtAuthGuard)`, decorator `@CurrentUser() user`, invoca `this.chestsService.listChests(user.id)` y retorna `ChestListResponse`

**Checkpoint**: US1 validada — listado de cofres funciona de forma independiente

---

## Phase 4: User Story 2 - Abrir un cofre y ver los drops (Priority: P2)

**Goal**: El jugador abre un cofre; el servidor resuelve drops autoritativamente, acredita inventario y emite WebSocket

**Independent Test**: `POST /chests/open` con `chestId` válido → 200 con `chest`, `drops` (no vacía), `pityProgress`; items en `InventoryItem`; `Chest.openedAt` poblado; segunda llamada → 409; cofre ajeno → 404

### Tests for User Story 2 ⚠️

> **NOTE: Escribir estos tests PRIMERO, verificar que FALLAN antes de implementación**

- [ ] T015 [P] [US2] Test de integración `POST /chests/open` (exitoso + 404) en `backend/test/chests.e2e-spec.ts`: (a) cofre bronze no abierto → 200 con `chest.openedAt` set, `drops.length > 0`, cada drop `{ itemId, name, qty, tier, isNew }`, items en `InventoryItem`, `pityProgress` presente; (b) `chestId` inexistente → 404; (c) cofre de otro usuario → 404
- [ ] T016 [P] [US2] Test de race-condition (SC-004) en `backend/test/chests-race.e2e-spec.ts`: dos `POST /chests/open` simultáneos al mismo `chestId` (`Promise.all`) → exactamente una 200, otra 409; `InventoryItem` no duplicado; `openedAt` set una vez

### Implementation for User Story 2

- [ ] T017 [US2] Implementar `ChestsService.openChest(userId, chestId)` en `chests.service.ts`. Flujo en `prisma.$transaction`: (1) `updateMany({ where: { id, userId, openedAt: null }, data: { openedAt: now } })` → `count === 0` → 404/409; (2) cargar drop table desde `GameDataModule`; (3) `ChestPityService.getPity(userId, type)`; (4) `DropEngineService.resolveDrop()` con `crypto.randomInt`; (5) `InventoryItem.upsert` por drop (cap 99, excedente→coins); (6) `chest.update({ drops: results })`; (7) update pity. Retornar `{ chest, drops, pityProgress }`
- [ ] T018 [US2] Implementar endpoint `@Post('open')` en `chests.controller.ts`: valida `OpenChestDto`, invoca `openChest()`, retorna `OpenChestResponse`. Post-transacción: emitir WS `chest:opened { chestId, type, drops }` vía `RealtimeModule`
- [ ] T019 [US2] Integrar pity básico en `openChest` (paso 7): tier >= minTier → `resetPity`; tier < minTier → `incrementPity`. Retornar `pityProgress: { count, threshold, minTier }` de `balance.json → chests.{type}.pity`

**Checkpoint**: US2 validada — bucle completo de apertura con drops funciona

---

## Phase 5: User Story 3 - Comprar cofres con monedas/gemas (Priority: P3)

**Goal**: El jugador compra cofres (bronze/silver/gold) con monedas o gemas, límite 5 compras/día por timezone

**Independent Test**: `POST /chests/purchase` con `{ type: "bronze", paymentMethod: "coins" }` → 200 con cofre creado, saldo descontado; saldo insuficiente → 400; 6ª compra/día → 409; tipo `diamond` → 400

### Tests for User Story 3 ⚠️

- [ ] T020 [P] [US3] Test de integración `POST /chests/purchase` en `backend/test/chests.e2e-spec.ts`: (a) compra con coins → 200, cofre `source: "purchase"` creado, `coinsRemaining` correcto; (b) saldo insuficiente → 400, no se crea cofre; (c) 6ª compra del día (seed 5 cofres `purchase` con `createdAt` hoy) → 409; (d) `type: "diamond"` → 400; (e) `paymentMethod: "gems"` → 200; (f) método inválido → 400

### Implementation for User Story 3

- [ ] T021 [US3] Implementar `ChestsService.purchaseChest(userId, type, paymentMethod)` en `chests.service.ts`. Flujo: (1) validar `type ∈ [bronze, silver, gold]` → 400; (2) validar `paymentMethod ∈ [coins, gems]` → 400; (3) precio de `balance.json → chests.{type}.prices`; (4) `startOfDay` con `user.timezone`; (5) `chest.count({ where: { userId, source: 'purchase', createdAt: { gte: startOfDay } } })` → 409 si >= 5; (6) `$transaction`: `user.update` decrement atómico (condición saldo >= price) + `chest.create({ source: 'purchase' })`; (7) WS `chest:unlocked`. Retornar `{ chest, coinsRemaining, gemsRemaining }`
- [ ] T022 [US3] Implementar endpoint `@Post('purchase')` en `chests.controller.ts`: valida `PurchaseChestDto`, invoca `purchaseChest()`, retorna `PurchaseChestResponse`

**Checkpoint**: US3 validada — compra directa funcional

---

## Phase 6: User Story 4 - Garantía de pity tras N aperturas (Priority: P4)

**Goal**: Tras `threshold` aperturas sin drop >= `minTier`, la siguiente garantiza tier >= `minTier` (re-roll forzado)

**Independent Test**: Seed `ChestPity` con `count = threshold`, abrir cofre → drop tier >= minTier garantizado; `count` resetea a 0

### Tests for User Story 4 ⚠️

- [ ] T023 [P] [US4] Test unitario de pity guarantee en `backend/src/modules/chests/drop-engine.service.spec.ts`: (a) 10 000 simulaciones `count = threshold`, `minTier: 'rare'` → 100% drops tier >= 'rare' (SC-002); (b) `count = threshold - 1` → NO forzado, distribución normal; (c) drop natural >= minTier → `count` resetea a 0

### Implementation for User Story 4

- [ ] T024 [US4] Extender `DropEngineService.resolveDrop()` en `drop-engine.service.ts`: añadir parámetro `pityState?: { count, threshold, minTier }`. Si `count >= threshold` y tier resultante < minTier → **re-roll**: filtrar `tierWeights` excluyendo tiers < minTier, normalizar, repetir selección. Retornar `{ drop, pityReset: boolean }`. Actualizar integración en `openChest` para pasar `pityState` y usar `pityReset`

**Checkpoint**: US4 validada — pity guarantee determinista (SC-002)

---

## Phase 7: User Story 5 - Historial de aperturas (Priority: P5)

**Goal**: El jugador ve su historial paginado de aperturas (fecha, tipo, drops) ordenado por fecha descendente

**Independent Test**: Abrir N cofres, `GET /chests/history?limit=50&offset=0` → 200 con `openings` ordenadas desc + `total` correcto; cap max 100 items

### Tests for User Story 5 ⚠️

- [ ] T025 [P] [US5] Test de integración `GET /chests/history` en `backend/test/chests.e2e-spec.ts`: (a) 120 aperturas, `?limit=50&offset=0` → 200 `{ openings: [50 items], total: 120 }` por `openedAt` desc; (b) 3 aperturas → 3 + total=3; (c) 0 aperturas → `[]` + total=0; (d) `?limit=200` → capped at 100

### Implementation for User Story 5

- [ ] T026 [US5] Implementar `ChestsService.getChestHistory(userId, limit, offset)` en `chests.service.ts`: `prisma.chest.findMany({ where: { userId, openedAt: { not: null } }, orderBy: { openedAt: 'desc' }, take: Math.min(limit, 100), skip: offset })` + `prisma.chest.count(...)` → mapear a `ChestHistoryResponse`
- [ ] T027 [US5] Implementar endpoint `@Get('history')` en `chests.controller.ts` con `@Query('limit') limit?` (default 50, max 100) y `@Query('offset') offset?` (default 0); invoca `getChestHistory()`, retorna `ChestHistoryResponse`

**Checkpoint**: US5 validada — historial paginado funcional

---

## Phase 8: Polish

**Purpose**: Refinamiento final, integración cross-módulo y validación de success criteria

- [ ] T028 [P] Añadir Swagger decorators (`@ApiTags('chests')`, `@ApiOperation`, `@ApiResponse`) a todos los endpoints en `chests.controller.ts`; ejecutar `pnpm export:openapi` → verificar `shared/openapi/openapi.json`
- [ ] T029 [P] Implementar `ChestsService.grantChest(userId, type, source): Promise<void>` en `chests.service.ts`: enqueue BullMQ `chests:create` con payload `{ userId, type, source }` (fire-and-forget). Documentar JSDoc para `missions`, `battles`, `pets/evolve`, `events`
- [ ] T030 [P] Verificar `chests:cleanup` job en `chests.processor.ts`: cofres > 30 días con `openedAt = null` → conversión a coins + `delete`; ejecutar trigger manual en dev
- [ ] T031 Validar Success Criteria: (SC-001) simulación 100k aperturas → ±5% pesos; (SC-002) 10k pity → 100%; (SC-003) p95 < 300ms `POST /chests/open`; (SC-004) race-condition 0 dup; (SC-005) valor medio ≈ 60% compra directa; (SC-006) 0 grants huérfanos

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede comenzar inmediatamente
- **Foundational (Phase 2)**: Depende de Setup — **BLOQUEA** todas las user stories
- **User Stories (Phase 3-7)**: Todas dependen de Foundational (Phase 2)
  - US1 (P1) puede comenzar en cuanto Foundational esté listo
  - US2 (P2) depende de US1 (comparte `chests.service.ts` y su estructura)
  - US3 (P3) depende de US1 (mismo `chests.service.ts`)
  - US4 (P4) depende de US2 (extiende `drop-engine.service.ts` y `openChest`)
  - US5 (P5) depende de US2 (requiere `Chest.drops` y `openedAt` poblados)
- **Polish (Phase 8)**: Depende de todas las user stories deseadas

### User Story Dependencies

- **US1 (P1)**: Solo necesita Phase 2 → puede comenzar inmediatamente
- **US2 (P2)**: Necesita Phase 2 + US1 (mismo `chests.service.ts`, mismo controller) → secuencia obligatoria
- **US3 (P3)**: Necesita Phase 2 + US1 → puede correr en paralelo con US2 si se separa temporalmente
- **US4 (P4)**: Necesita US2 (extiende `drop-engine.service.ts`) → no puede correr en paralelo con US2
- **US5 (P5)**: Necesita US2 (requiere datos poblados) → puede correr en paralelo con US3

### Within Each User Story

- Tests ESCRITOS PRIMERO deben FALLAR antes de implementar
- DTOs (Phase 1) antes de services
- Services antes de endpoints (controller)
- Core implementation antes de integración (WebSocket, BullMQ)
- Story completa antes de pasar a la siguiente prioridad

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005 en paralelo (archivos de DTO distintos)
- **Phase 2**: T007 (balance.json) [P] con T006 (Prisma); T010 y T011 [P] con T009 (DropEngineService)
- **Phase 3-7**: US3 y US5 en paralelo (métodos separados, tests distintos); US4 solo tras US2
- **Phase 8**: T028, T029, T030 en paralelo (archivos/lógica distintos)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — bloquea todo)
3. Complete Phase 3: User Story 1
4. **PARARSE Y VALIDAR**: Test US1 de forma independiente
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → Fundación lista
2. US1 → Test independiente → Demo (ver grid de cofres)
3. US2 → Test independiente → Demo (abrir + drops + WebSocket)
4. US3 → Test independiente → Demo (compra directa)
5. US4 → Test independiente → Demo (pity guarantee)
6. US5 → Test independiente → Demo (historial)
7. Polish → Feature completa
8. Cada story agrega valor sin romper las anteriores

### Parallel Team Strategy

Con múltiples desarrolladores:

1. Equipo completo hace Phase 1 + Phase 2 juntos
2. Cuando Foundational está listo:
   - Dev A: US1 → US2 (mismo `chests.service.ts`, misma ruta)
   - Dev B: prep tests US3 + US5 (archivos de test separados)
3. Cuando US2 está completa:
   - Dev A: US4 (extiende `drop-engine.service.ts`)
   - Dev B: US3 + US5 (métodos separados)
4. Polish: todos en paralelo (T028, T029, T030)
5. T031 (validación SC): QA/Dev conjunto

---

## Notes

- [P] = archivos distintos, sin dependencias — pueden asignarse a diferentes devs
- [USx] mapea tarea a user story para trazabilidad
- Cada user story debe ser independently completable y testable
- Verificar tests fallan antes de implementar (TDD)
- Commit después de cada task o grupo lógico
- Parar en cada checkpoint para validar la story de forma independiente
- Evitar: tasks vagas, conflictos en el mismo archivo, dependencias cross-story que rompan independencia
- `crypto.randomInt` SIEMPRE (nunca `Math.random`)
- Transacciones Prisma atómicas para idempotencia (anti race-condition)
- Los drops son irreversibles: no existe rollback
- Solo bronze/silver/gold comprables; diamond y mythic NO
- Cofres caducan a 30 días → coins (job `chests:cleanup`)
- Tiers de drop ≠ tiers de rareza de pet (sistemas independientes)
- Cap qty at 99; excedente → coins (FR-015)
- Rate limiting existente aplica a endpoints de compra
- `grantChest()` expuesto para otros módulos (fire-and-forget via BullMQ)