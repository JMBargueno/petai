# Convergencia: Cofres y Drops (002-cofres-drops)

**Fecha**: 2026-11-13 | **Autor**: code-review (convergencia)
**Entradas analizadas**: `spec.md`, `plan.md`, `tasks.md`, `contracts/api-contract.md` + código implementado en `backend/src/modules/chests/`, `backend/prisma/schema.prisma`, `shared/game-data/balance.json`, `backend/src/app.module.ts`.

**Veredicto global**: 🟡 **CONVERGE CON GAPES** — el núcleo (US1–US5) está completo, correcto y alineado con el spec. Hay **1 gap funcional importante** (`chest:opened` no emitido) y **1 desviación de stack** (BullMQ vs in-process) que requieren decisión/explicitación antes del merge.

---

## 1. Verificación de tareas

| Tarea | Descripción | Estado | Nota |
|-------|-------------|--------|------|
| T001 | Estructura `modules/chests/` + `dto/` | ✅ | Presente |
| T002 | `chest.dto.ts` (ChestResponse, ChestListResponse, OpenChestResponse, DropItem, PityProgress) | ✅ | Todos los DTOs presentes, campos según contrato |
| T003 | `chest-open.dto.ts` `OpenChestDto { chestId }` | ✅⚠️ | Presente. El spec pedía validación `@IsUUID` (class-validator); la validación se hace autoritativa en el servicio (`isUUID` + 404). Aceptable, ver §5.4 |
| T004 | `chest-purchase.dto.ts` `PurchaseChestDto` | ✅⚠️ | Presente. Pedía `@IsIn`; validación autoritativa en servicio (400). Aceptable, ver §5.4 |
| T005 | `chest-history.dto.ts` (`ChestHistoryResponse`, `OpeningRecord`) | ✅ | Correcto |
| T006 | Prisma `model Chest` + `model ChestPity` + relaciones en `User` + índice + unique + migración | ✅ | `schema.prisma:326-350`: `Chest` con `@@index([userId, openedAt])`; `ChestPity` con `@@unique([userId, tier])`; `User.chests`/`User.chestPity` (líneas 34-35). Migración no verificable estáticamente |
| T007 | Sección `chests` en `balance.json` | ✅ | 5 tipos con `dropTable`/`tierWeights`/`pity`/`prices` + `rewardConfig`, `maxPurchasesPerDay:5`, `expiryDays:30`. Ver §5.5 (naming `dropTable` vs `items`) |
| T008 | `chests.module.ts` + registro en `app.module.ts` | ✅ | Módulo importa `Prisma/Redis/GameData/Realtime`; `ChestsModule` registrado en `app.module.ts:49` |
| T009 | `drop-engine.service.ts` motor puro | ✅⚠️ | Motor puro (sin `@Injectable`), weighted roll correcto. **Firma difiere** de la del spec: impl. `resolveDrop(dropTable, tierWeights, qtyRange, pityState?, rng?)` vs spec `resolveDrop(dropTable, tierWeights, rng, qtyRange)`. Superset necesario para US4. Ver §5.3 |
| T010 | `chest-pity.service.ts` (getPity/incrementPity/resetPity) | ✅ | Incluye soporte de cliente de transacción (`tx`), correcto para FR-005 |
| T011 | `chests.processor.ts` workers | ✅⚠️ | **Desviación**: no usa BullMQ `@Processor/@Worker`; usa `@nestjs/schedule` (Cron) + método público `processCreate` vía `setImmediate`. Justificado en comentarios (stack del proyecto = in-process, YAGNI). Ver §5.2 (gap FR-013) |
| T012 | Test E2E `GET /chests` | ✅ | `backend/test/chests.e2e-spec.ts` existe |
| T013 | `listChests` | ✅ | `where: { userId, openedAt: null }`, `orderBy createdAt asc` |
| T014 | Endpoint `@Get('/')` + guard | ✅ | `JwtAuthGuard` a nivel de controlador, `@CurrentUser` |
| T015 | Test E2E `POST /chests/open` | ✅ | En `chests.e2e-spec.ts` |
| T016 | Test race-condition (SC-004) | ✅ | `backend/test/chests-race.e2e-spec.ts` existe |
| T017 | `openChest` transacción atómica | ✅ | Fl completo: reclamo `updateMany`, drops, inventario, persistencia, pity |
| T018 | Endpoint `@Post('open')` + **WS `chest:opened`** | ❌ | Endpoint ✅. **El evento WS `chest:opened` NO se emite** — ver §5.1 (GAP) |
| T019 | Pity básico en `openChest` + `pityProgress` | ✅ | reset si `anyMeets` >= minTier, else increment; retorna `pityProgress` |
| T020 | Test E2E `POST /chests/purchase` | ✅ | En `chests.e2e-spec.ts` |
| T021 | `purchaseChest` | ✅ | Validación, precio, `startOfDayInTimezone`, límite 5/día, decremento atómico con condición |
| T022 | Endpoint `@Post('purchase')` | ✅ | — |
| T023 | Test unitario pity guarantee | ✅ | `drop-engine.service.spec.ts` existe en `modules/chests/` |
| T024 | `resolveDrop` con `pityState` (re-roll forzado) | ✅ | `collectForcedTiers` + re-roll restringido a tiers >= minTier |
| T025 | Test E2E `GET /chests/history` | ✅ | En `chests.e2e-spec.ts` |
| T026 | `getChestHistory` | ✅ | `openedAt desc`, `take=min(limit,100)`, `count` total |
| T027 | Endpoint `@Get('history')` con query limit/offset | ✅ | `ParseIntPipe`, defaults 50/0 |
| T028 | Swagger decorators + `export:openapi` | ✅⚠️ | Decorators presentes en controller. Ejecución de `pnpm export:openapi` no verificable estáticamente |
| T029 | `grantChest` fire-and-forget | ✅ | `setImmediate` → `processCreate`. JSDoc documenta llamantes |
| T030 | `chests:cleanup` >30d → coins + delete | ✅ | `@Cron(EVERY_DAY_AT_3AM)`, `expiryDays` data-driven, refund = media del precio en coins |
| T031 | Validación SC-001..SC-006 | ⚠️ | No verificable estáticamente (requiere corrida de simulación/perf); el motor soporta inyección de `rng` para los tests |

**Resumen**: 26/31 ✅, 3 ⚠️ (desviaciones documentadas: T003/T004 validación DTO, T009 firma, T011 BullMQ, T028 openapi), 1 ❌ (T018 evento WS `chest:opened`).

> Nota: las tareas están marcadas como `[ ]` (incompletas) en `tasks.md` a pesar de estar implementadas. Debe actualizarse el checkbox a `[x]` en un commit de cierre.


## 2. Verificación de acceptance criteria (Given/When/Then)

### US1 — Listado de cofres (P1)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | 3 no abiertos + 2 abiertos → 200 con los 3, excluye abiertos | `listChests` filtra `openedAt: null`; mapea `id/type/source/createdAt` | ✅ |
| 2 | Sin cofres → 200 `{ chests: [] }` | `findMany` vacío → `[]` | ✅ |
| 3 | Sin token / token inválido → 401 | `JwtAuthGuard` global en controller | ✅ |

### US2 — Abrir cofre + drops (P2)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | Cores bronze → 200 `{ chest, drops, pityProgress }`, drops autoritativos, inventario, `openedAt` | `openChest`: `crypto.randomInt` vía `cryptoRng`; `inventoryItem.upsert`; `Chest.openedAt=now`; `Chest.drops` persistidos | ✅ |
| 2 | `chestId` inexistente/ajeno → 404 | `findFirst({ id, userId })` → `NotFoundException` | ✅ |
| 3 | Ya abierto → 409 | `existing.openedAt` → `ConflictException` + reclamo `updateMany` | ✅ |
| 4 | Race condition → una 200, otra 409 | `updateMany({ where: openedAt:null })` atómico (SC-004); test en `chests-race.e2e-spec.ts` | ✅ |
| 5 | **WS `chest:opened` emitido al abrir** | **NO emitido en `openChest` ni en el controller** | ❌ **GAP** (ver §5.1) |

### US3 — Comprar (P3)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | `bronze`+coins → 200 cofre creado, saldo descontado, `coinsRemaining` | `purchaseChest` transacción con `updateMany({ coins gte price })` + `chest.create` | ✅ |
| 2 | Saldo insuficiente → 400, sin cofre/descuento | Check pre + condición atómica `charged.count===0` → 400 | ✅ |
| 3 | 6ª compra/día → 409 | `chest.count({ source:'purchase', createdAt gte startOfDay }) >= 5` | ✅ |
| 4 | `diamond`/`mythic`/método inválido → 400 | `PURCHASABLE_TYPES` + check método → 400 | ✅ |

### US4 — Pity (P4)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | `count=threshold`, minTier rare → drop >= rare garantizado, reset a 0 | `resolveDrop` re-roll forzado; `resetPity` si `anyMeets` | ✅ |
| 2 | `count=threshold-1` → no forzado, increment a 10 | `count >= threshold` no se cumple → roll normal; `incrementPity` | ✅ |
| 3 | Drop natural >= minTier → reset a 0 | `anyMeets` → `resetPity` | ✅ |

### US5 — Historial (P5)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | 120 aperturas, `?limit=50&offset=0` → 50 items, total 120, desc | `findMany` + `count`, `openedAt desc`, `take=50` | ✅ |
| 2 | 3 aperturas → 3 + total 3 | ✅ |
| 3 | 0 aperturas → `[]` + total 0 | ✅ |

### US6 — Info de rareza mínima antes de comprar (P6)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | Expone rareza mínima + `pityProgress` actual de un tipo | **No hay endpoint que expone la info de compra/pity por tipo** (solo se devuelve tras abrir) | ❌ **No implementado** |
| 2 | Usuario sin pity → `count: 0` | n/a | ❌ |

> US6 (P6) **no está en `tasks.md`** ni implementado. Es un valor informativo/UX de baja prioridad; puede deferirse, pero debe registrarse como scope-out explícito o en un backlog.

### US7 — Míticos solo en eventos (P7)
| # | Escenario | Verificación | Estado |
|---|-----------|--------------|--------|
| 1 | `purchase` con `mythic` → 400 | `PURCHASABLE_TYPES` rechaza → 400 | ✅ |
| 2 | Evento → `Chest` mythic `source:'event'` | `grantChest`/`processCreate` crean el cofre con el source dado (no bloquea type/source en `processCreate`) | ✅ (mecanismo disponible) |
| 3 | Victoria Arena 10% → `source:'battle'` | El mecanismo de `grantChest(userId,'gold','battle')` está expuesto; el trigger 10% vive en el módulo `battles` (fuera de este feature) | ✅ (contrato) |

## 3. Verificación del API contract

| Endpoint / evento | Contrato | Implementación | Estado |
|-------------------|----------|----------------|--------|
| `GET /chests` → 200 `ChestListResponse` / 401 | `chests:[{id,type,source,createdAt}]` | `listChests` → `ChestListResponse` | ✅ |
| `POST /chests/open` → 200/401/404/409 | `{ chest, drops, pityProgress }` | `openChest` — todos los status correctos | ✅ |
| `DropItem { itemId, name, qty(1-99), tier, isNew }` | qty cap 99, excedente→coins | `MAX_QTY_PER_DROP=99`, `bonusCoins`→`coins` | ✅ |
| `PityProgress { count, threshold, minTier }` | de `balance.json` | Correcto | ✅ |
| `POST /chests/purchase` → 200/400/401/409 | `{ chest, coinsRemaining, gemsRemaining }` | `purchaseChest` — correcto | ✅ |
| `GET /chests/history?limit&offset` → 200 | `{ openings, total }`, desc, cap 100 | `getChestHistory` — correcto | ✅ |
| WS `chest:unlocked { chestId, type, source }` | al crear | Emitido en `processCreate` + `purchaseChest` | ✅ |
| WS `chest:opened { chestId, type, drops }` | al abrir | **NO emitido** | ❌ |
| Enums `type`/`source`/`tier` | 5 / 5 / 5 valores | DTOs y motor usan los mismos enums | ✅ |
| Formato de error (AppExceptionFilter) | `{ statusCode, message, error }` | Excepciones estándar de Nest → filter global | ✅ |

**Enfoque de validación**: el contrato documenta validación de body, pero la implementación la resuelve autoritativamente en el servicio (404/409/400) en vez de class-validator en el DTO. El *resultado observable* (códigos de estado) coincide con el contrato; solo el *mecanismo* difiere.

---

## 4. Constitución compliance

| Artículo | Requisito | Veredicto | Evidencia |
|----------|-----------|-----------|-----------|
| **I. Backend autoritativo** | `crypto.randomInt`; transacciones atómicas `updateMany`+condición; userId desde JWT | ✅ **PASS** | `cryptoRng` usa `crypto.randomInt`; reclamo de apertura y cobro de compra usan `updateMany` con condición; `userId` siempre de `@CurrentUser`; `chestId` validado autoritativamente (`isUUID` + pertenencia) |
| **II. Combate determinista** | PRNG fijo, orden estable | ✅ N/A-PASS | El motor de drops es one-shot (no multi-turno como combate); orden de tiers fijo `DROP_TIERS`; `rng` inyectable para tests |
| **III. Consistencia multi-plataforma** | Contrato único `openapi.json`; datos en `shared/game-data` | ✅ PASS | `@nestjs/swagger` en endpoints; drops 100% data-driven desde `balance.json → chests`. ⚠️ Confirmar que `pnpm export:openapi` se ejecutó (T028) |
| **VIII. Seguridad** | Validación estricta de inputs del cliente | ✅ PASS | `chestId` (UUID+pertenencia), `type`/`paymentMethod` (whitelist), `limit/offset` (ParseIntPipe + clamp) |
| **YAGNI** | No sobrediseñar infraestructura | ✅ PASS | La decisión de in-process (vs BullMQ) es coherente con el principio YAGNI — ver §5.2 (aunque contradice la letra de FR-013) |

**Sin violaciones constitucionales.** La única tensión es FR-013 (letra "BullMQ") vs la práctica YAGNI/stack real — ver §5.2.
## 5. Gaps encontrados

### 5.1 (GAP — IMPORTANTE) Evento WS `chest:opened` no se emite
- **Evidencia**: `chests.service.ts` `openChest()` termina en el `return` (líneas ~226-240) **sin** llamar a `realtime.emitToUser(userId, 'chest:opened', ...)`. El controller tampoco lo emite. `chest:opened` solo aparece en docs/contrato, no en el código.
- **Impacto**: Viola **FR-012** ("MUST emit ... `chest:opened { chestId, type, drops }` when a chest is opened"), **US2 acceptance #5** y **T018**. El cliente no recibe la revelación en tiempo real (solo la reconstruiría del historial).
- **Nota mitigante**: la apertura *sí* persiste drops e inventario correctamente; solo falta la notificación. No rompe el flujo central ni es anti-cheat (los drops ya están persistidos).

### 5.2 (DEVIACIÓN — MEDIA) Sin BullMQ (in-process)
- **Evidencia**: `chests.processor.ts` usa `@nestjs/schedule` + `setImmediate`; `grantChest` no hace *enqueue* a BullMQ. El comentario justifica: "el proyecto usa `@nestjs/schedule`/in-process (YAGNI)".
- **Impacto**: FR-013 dice literalmente "MUST create chests asynchronously via the `chests:create` BullMQ job". Funcionalmente el cofre **se** crea de forma asíncrona (no bloquea al llamante), así que el *objetivo* (no bloquear la acción disparadora) se cumple. Pero:
  - No hay *duración/durabilidad* de jobs (si el proceso cae entre `setImmediate` y el `create`, el cofre se pierde).
  - La letra del spec/contrato (`enqueue job BullMQ`) no se cumple.
- **Decisión requerida**: (a) actualizar FR-013/T011 y el contrato a "asíncrono in-process" (enmienda de spec), o (b) implementar el worker BullMQ real si se requiere durabilidad. **Hoy, dejarlo así sin enmendar el spec = divergencia spec/code.**

### 5.3 (DEVIACIÓN — BAJA) Firma de `resolveDrop`
- **Evidencia**: spec `resolveDrop(dropTable, tierWeights, rng, qtyRange)`; impl. `resolveDrop(dropTable, tierWeights, qtyRange, pityState?, rng?)`.
- **Impacto**: Ninguno funcional; la firma es un superset y es la forma natural de añadir US4 (pity) + rng inyectable. Los tests usan la firma real. Solo documentación desfasada.

### 5.4 (MINOR) Validación de DTOs sin class-validator
- **Evidencia**: `chest-open.dto.ts` y `chest-purchase.dto.ts` solo tienen `@ApiProperty`; no `@IsUUID`/`@IsIn` (T003/T004). No hay `ValidationPipe` global aplicada sobre estos DTOs.
- **Impacto**: Bajo — la validación autoritativa en el servicio produce los mismos códigos de estado (404/400). Pero un body vacío/malformado podría llegar al servicio; la validación en DTO era la defensa declarativa prevista. Aceptable, pero conviene añadir los decoradores para robustez y para que Swagger exponga la validación.

### 5.5 (MINOR) Naming de `balance.json`
- **Evidencia**: T007 describía `items` array; la implementación usa `dropTable`. Todos los campos requeridos están presentes.
- **Impacto**: Ninguno (es coherente en código y datos). Solo el texto de la task no se actualizó.

### 5.6 (SCOPE) US6 (P6) no cubierto
- **Evidencia**: No hay tarea ni implementación para exponer la rareza mínima / pity por tipo antes de comprar.
- **Impacto**: P6 = valor informativo/UX, no bloqueante. Debe registrarse como deferido o añadir task + endpoint (p. ej. `GET /chests/pity` o incluirlo en el response de compra).

### 5.7 (VERIFY) `pnpm export:openapi` no verificado
- **Evidencia**: Los `@nestjs/swagger` están puestos, pero no hay evidencia de que `shared/openapi/openapi.json` se regeneró con los endpoints de chests.
- **Acción**: Ejecutar `pnpm export:openapi` y verificar que los 4 endpoints + schemas aparecen.

### 5.8 (VERIFY) Rate limiting en compra
- **Evidencia**: `chests.controller.ts` no aplica `@Throttle`/limiter explícito en `purchase`. El spec asume "rate limiting existente del backend aplica a endpoints de compra".
- **Acción**: Confirmar que hay un guard de throttling global o añadirlo al endpoint de compra.

## 6. Fix recomendados (prioridad)

| # | Prioridad | Fix | Evidencia |
|---|-----------|-----|-----------|
| F1 | **P0** | Emitir `chest:opened` tras la transacción de apertura exitosa en `openChest()`: `this.realtime.emitToUser(userId, 'chest:opened', { chestId: existing.id, type: existing.type, drops: drops.map(d => ({ itemId: d.itemId, name: d.name, qty: d.qty, tier: d.tier })) })`. Añadir assertion en `chests.e2e-spec.ts`. | §5.1 |
| F2 | **P0** | **Decidir y alinear** la infraestructura de jobs: (a) enmendar FR-013/T011/contrato a "asíncrono in-process" (recomendado, YAGNI), o (b) implementar worker BullMQ `chests:create`/`chests:cleanup`. Documentar la decisión en el PR. | §5.2 |
| F3 | **P1** | Añadir `@IsUUID` a `OpenChestDto.chestId` y `@IsIn` a `PurchaseChestDto.type/paymentMethod` (+ `ValidationPipe` si no es global) para alinear con T003/T004. | §5.4 |
| F4 | **P1** | Regenerar `shared/openapi/openapi.json` (`pnpm export:openapi`) y verificar los endpoints de chests. | §5.7 |
| F5 | **P2** | Registrar US6 (P6) como scope-out explícito en `spec.md`/backlog, o añadir task + endpoint de info de pity por tipo. | §5.6 |
| F6 | **P2** | Actualizar `tasks.md`: marcar tareas implementadas `[x]`; corregir la firma documentada de `resolveDrop` (T009) y el naming `items`→`dropTable` (T007) para que el tracking refleje la realidad. | §5.3/§5.5 |
| F7 | **P2** | Confirmar/garantizar rate limiting sobre `POST /chests/purchase` (guard global o `@Throttle`). | §5.8 |
| F8 | **P3** | Validar success criteria con la corrida (T031): simulación 100k (SC-001), 10k pity (SC-002), p95 <300ms (SC-003), race (SC-004, ya cubierto por `chests-race.e2e-spec.ts`), 0 grants huérfanos (SC-006). | §1 T031 |

---

## Criterio "Hecho cuando"

- [ ] F1: `chest:opened` emitido + testeado
- [ ] F2: decisión de BullMQ/in-process documentada y spec/contrato alineados
- [ ] F3: validación de DTOs presente
- [ ] F4: `openapi.json` regenerado
- [ ] F5: US6 resuelto (scope-out o task)
- [ ] F6: `tasks.md` actualizado
- [ ] F7: rate limiting de compra confirmado
- [ ] F8: SC validadas en la corrida

**Conclusión**: la feature está **funcionalmente convergente** para el MVP (US1–US5) y **cumple la constitución**. Antes del merge se cierran el **gap P0 de `chest:opened`** (F1) y la **decisión de infraestructura de jobs** (F2); el resto (F3–F8) son remates de robustez/tracking.





