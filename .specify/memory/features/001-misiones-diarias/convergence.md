# Convergence Report: 001-misiones-diarias

**Fecha**: 2026-11-13
**Analista**: Review de convergencia
**Alcance**: `spec.md`, `plan.md`, `tasks.md`, `contracts/api-contract.md`, `constitution.md` y todo el código en `backend/src/missions/` (+ Prisma, `app.module.ts`, `pets.service.ts`, `RealtimeGateway`, `missions.json`, `openapi.json`, tests).

## Veredicto ejecutivo

**Convergencia: 🟡 PARCIAL — NO CONVERGIDA aún.**

El núcleo de la feature (US1–US3) está bien implementado y testeado, y el módulo está correctamente cableado (módulo, registro en `AppModule`, deps, DTOs, guard, `crypto.randomInt`, `pet:level_up`). **31 tests unitarios pasan** (4 suites).

Sin embargo hay **5 brechas materiales** que impiden declarar la feature convergida:

| # | Brecha | Severidad |
|---|--------|-----------|
| C1 | `GET /missions/:id` devuelve el formato de **lista**, no el de **detalle** (falta `period`, `claimed`, `periodStart`, `periodEnd`, `createdAt`) — rompe el contrato y el DTO. | 🔴 Alta (contrato) |
| C2 | `shared/openapi/openapi.json` **no contiene los endpoints de misiones** (ni de cofres) → el contrato único (Constitución III) está desincronizado. | 🔴 Alta (constitución) |
| C3 | Scheduler con `take: 100` **sin paginación/cursor** → solo se procesan los mismos ~100 usuarios; el resto nunca recibe reset programado. | 🟠 Media (escala) |
| C4 | **No se crea ningún cofre diario** ni se emite `chestId` (US4); `ChestsModule` existe pero no está cableado. | 🟠 Media (US4) |
| C5 | `claimReward` no está en `$transaction` y el increment de progreso es read-then-write (no atómico) → riesgo de pérdida de recompensa/progress bajo fallo o concurrencia. | 🟠 Media (robustez, Constitución I) |

Además hay desviaciones menores (anti-repetición más estricta que el spec, streaks por UTC en vez de por timezone, ausencia del spec de generación y de escenarios E2E críticos).

**Criterio**: 3 user stories (US1, US2, US3) convergen; US4 y US5/US6 y el polimento (Phase 8) **no** convergen.

---

## 1. Completación de tareas (tasks.md)

Leyenda: ✅ cumplido · ⚠️ parcial · ❌ no cumplido.

### Phase 1 — Setup
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T001 — deps `@nestjs/schedule` + `@nestjs/event-emitter` | ✅ | `package.json` línea 25/28: `@nestjs/event-emitter ^3.0.0`, `@nestjs/schedule ^6.0.0`. |
| T002 — `missions.json` legible por `GameDataService.getMissions()` | ✅ | `shared/game-data/missions.json` con `{daily:{minCount,maxCount,types[]},weekly:{...}}`; `mission-generation.service.ts` lo consume vía `this.gameData.getMissions()?.daily/.weekly`. |
| T003 — índices del modelo `Mission` | ✅ | `schema.prisma:319-320`: `@@index([userId, period, periodEnd])` y `@@index([userId, completed])`. |

### Phase 2 — Foundational
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T004 — `missions.module.ts` | ✅ | `@Module` con `imports:[PrismaModule, RedisModule, GameDataModule, RealtimeModule]`, `controllers:[MissionsController]`, 4 providers, `exports:[MissionsService]`. |
| T005 — registro en `app.module.ts` | ✅ | `ScheduleModule.forRoot()`, `EventEmitterModule.forRoot()`, `MissionsModule` presentes en `imports[]`. |
| T006 — `dto/mission-claim.dto.ts` | ✅ | `MissionResponseDto`, `MissionListResponseDto`, `MissionDetailResponseDto`, `MissionSummaryResponseDto`, `ClaimRewardResponseDto` (+ `MissionRewardDto`, `ClaimedMissionDto`) con `@ApiProperty`. |

### Phase 3 — US1
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T007 — `missions.controller.spec.ts` | ✅ | Existe; suites para `GET /`, `/summary`, `/:id`, `/claim` (401/200/routing). |
| T008 — `missions.service.spec.ts` (getMissions) | ✅ | Tests: lazy init, formato, `dailyChestUnlocked` true/false. |
| T009 — `missions.controller.ts` | ✅ | `@Controller('missions')` + `@UseGuards(JwtAuthGuard)`; 4 endpoints; Swagger `@ApiTags/@ApiResponse`. Usa `@CurrentUser()` para `id`/`timezone`. |
| T010 — `mission-generation.service.ts` (generación) | ✅ (con desviación) | `ensureMissionsExist`, `getDailyPeriod`, `getWeeklyPeriod`, `selectMissionTypes` (anti-repetición), `crypto.randomInt` (NO `Math.random`). Ver desviación en §6 (G5). |
| T011 — `getMissions()` | ✅ | Lazy init → `findMany` (daily/weekly, `periodEnd > now`) → `formatMission` → `dailyChestUnlocked`. |

### Phase 4 — US2
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T012 — `mission-tracking.service.spec.ts` | ✅ | Tests: feed, battle+battle_win, hatch+hatch_rare, no-op, completed emit, cap, throttle 2s. |
| T013 — `mission-tracking.service.ts` (listeners) | ✅ | Los 9 `@OnEvent` (`pet:fed/cleaned/slept/evolved`, `egg:hatched`, `battle:finished`, `minigame:finished`, `chat:message_sent`, `pet:level_up`) + `incrementProgress`. |
| T014 — `pets.service.ts` emite `pet:level_up` | ✅ | `pets.service.ts:376`: `this.eventEmitter.emit('pet:level_up', { userId, petId })`. |
| T015 — emit WS (progress/completed) | ✅ | `mission:progress {missionId,current,target}` throttle 2s; `mission:completed {missionId,type,reward,dailyCompleted,dailyTotal}`; listener async vía `@OnEvent`. |

### Phase 5 — US3
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T016 — spec de `claimReward` | ✅ | Tests: 200, 409, 400, 404, **race condition** (2 claims concurrentes). |
| T017 — `claimReward` atómico | ⚠️ | Usa `updateMany({id,userId,claimed:false},{claimed:true})` + `count===0→409` + `user.update` increment. El guard **evita duplicar** recompensa, PERO las 2 operaciones NO están en un `prisma.$transaction` (ver C5). |
| T018 — emit `mission:completed` | ✅ | `emitMissionCompleted` con payload correcto. |

### Phase 6 — US4
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T019 — spec del cofre | ✅ (parcial) | Tests de `dailyChestUnlocked` true/false. **No** hay test de emisión `mission:daily_complete` con `chestId` ni de stub de cofre. |
| T020 — lógica de desbloqueo + stub | ⚠️ | `dailyChestUnlocked = completed===total && total>0` (getMissions + post-claim). **No existe** `unlockDailyChest()` ni stub `{chestId:'stub'}` ni creación de `Chest` (ver C4). |
| T021 — emit `mission:daily_complete` | ⚠️ | Se emite `{chestUnlocked:true}` cuando `dailyCompleted===dailyTotal && dailyTotal>0`. **Falta `chestId`** (el spec/FR-009 lo piden; el contrato no). |

### Phase 7 — US5
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T022 — `mission-scheduler.service.spec.ts` | ✅ | Tests: batch, weekly, no duplica, cleanup, manejo de errores. |
| T023 — `mission-scheduler.service.ts` | ⚠️ | `@Cron(EVERY_5_MINUTES)` para daily y weekly + cleanup. **Problema**: `take:100` sin `skip`/cursor/`orderBy` → siempre los mismos ~100 usuarios (ver C3). `now` se pasa pero no se usa. |
| T024 — `generateWeeklyMissions` | ✅ | 5-7, `periodStart`=lunes local, `periodEnd`=lunes siguiente local, anti-repetición. |

### Phase 8 — Polish
| Task | Estado | Evidencia / explicación |
|------|--------|--------------------------|
| T025 — `missions.e2e-spec.ts` (flujo completo) | ⚠️ | Existe con 6 casos (401, 200, summary, 404/:id, 400 claim, 404 claim). **Faltan**: `feed → mission:progress` WS, **race condition** (2×claim), **reset por timezone**. |
| T026 — `pnpm export:openapi` → `openapi.json` | ❌ | `shared/openapi/openapi.json` (37 KB) **NO contiene** `/missions` ni `Chest`. El artefacto no se regeneró tras añadir el módulo (ver C2). |
| T027 — `crypto.randomInt` (Constitución I) | ✅ | `import * as crypto`; `crypto.randomInt` en `randomInt()` y `weightedSelect`. Sin `Math.random`. |
| T028 — persistencia PG (flush Redis→PG 30s / al completar) | ❌ | No hay contador caliente en Redis ni flush; se escribe a PG por evento. El contrato no lo exige (ver desviación G9). |
| T029 — suite completa + cobertura >80% | ⚠️ | Unitarios: **31/31 pasan** (verificado). E2E parcial (T025). Cobertura no medida; falta `mission-generation.service.spec.ts`. |
| T030 — validar contra contrato | ⚠️ | GET /missions, /summary y /claim matchean. `GET /:id` **no** matchea (C1). |

**Resumen de tasks**: ✅ 20 · ⚠️ 7 (T017, T019, T020, T021, T023, T025, T029, T030) · ❌ 2 (T026, T028) · + falta el spec de generación (G10). *T010 funciona pero desvía la anti-repetición.*

---

## 2. Criterios de aceptación (spec.md — Given/When/Then)

### US1 — Panel de misiones
| AC | Resultado | Verificación en código |
|----|-----------|------------------------|
| 1. GET /missions → 3-5 diarias + 5-7 semanales c/ `type`,`target`,`current`,`reward` | ✅ | `ensureMissionsExist` + `findMany`; `formatMission` expone todos los campos. |
| 2. Sin token / token inválido → 401 | ✅ | `JwtAuthGuard` en el controller. |
| 3. 4 diarias → `dailyChestUnlocked:false` + `resetsAt` = medianoche local | ✅ | `dailyChestUnlocked` calculado; `resetsAt = periodEnd.toISOString()` (medianoche local vía `endOfLocalDay`). |

### US2 — Progreso en tiempo real
| AC | Resultado | Verificación en código |
|----|-----------|------------------------|
| 1. feed target2/current1 → feed → current2, completed, `mission:progress {missionId,current:2,target:2}` | ✅ | `onPetFed → incrementProgress` → `emitProgress`. |
| 2. battle target1/current0 → `battle:finished` → current1, completed | ✅ | `onBattleFinished → incrementProgress('battle')`. |
| 3. Sin misión chat activa → mensaje → no-op, acción completa | ✅ | `incrementProgress` → `if (missions.length===0) return`. |

### US3 — Reclamar recompensa
| AC | Resultado | Verificación en código |
|----|-----------|------------------------|
| 1. feed completada/no reclamada → claim → acredita `{coins,xp}`, `claimed:true`, 200 | ⚠️ | Funciona; no está en `$transaction` (C5). |
| 2. Ya reclamada → claim → 409 sin duplicar | ✅ | `mission.claimed` + `updateMany count===0 → ConflictException`. |
| 3. No completada → claim → 400 | ✅ | `!mission.completed → BadRequestException`. |
| 4. ID inexistente / no del usuario → 404 | ✅ | `findFirst({id,userId})` → `null → NotFoundException`. |
| 5. Progress alcanza target por evento → `mission:completed {missionId,type,reward,dailyCompleted,dailyTotal}` | ✅ | `emitMissionCompleted`. |

### US4 — Cofre diario
| AC | Resultado | Verificación en código |
|----|-----------|------------------------|
| 1. 4 diarias, 3 hechas → completa la 4ª → desbloquea `Chest` daily, `dailyChestUnlocked:true`, `mission:daily_complete {chestUnlocked:true,chestId}` | ⚠️ | `dailyChestUnlocked:true` ✅ y emit `chestUnlocked:true` ✅. **NO** se crea `Chest` ni hay `chestId` (C4). |
| 2. Con diarias incompletas → `dailyChestUnlocked:false` | ✅ | Cálculo correcto. |
| 3. Feature #2 no disponible → stub de recompensa fija (no fallar) | ⚠️ | No hay stub, pero **no falla** (booleano calculado). `ChestsModule` SÍ está en `AppModule` pero no cableado (C4). |

### US5 — Misiones semanales (7 días)
| AC | Resultado | Verificación en código |
|----|-----------|------------------------|
| 1. GET /missions → 5-7 semanales c/ `periodStart`(lunes) y `periodEnd`(domingo) | ✅ | `getWeeklyPeriod` (lunes 00:00 local → lunes siguiente). |
| 2. battle_win target3 → 3 victorias → current3, completed | ✅ | `onBattleFinished` condicional `battle_win` al ganar. |
| 3. Lunes 00:00 local → `missions:weekly-reset` cierra antiguas y genera nuevas | ⚠️ | Cierre implícito por filtro `periodEnd>now` + generación en scheduler/lazy init. Limitado por `take:100` (C3). |

### US6 — Anti-repetición + reset por timezone
| AC | Resultado | Verificación en código |
|----|-----------|------------------------|
| 1. Medianoche local → `missions:daily-reset` genera 3-5 nuevas y cierra antiguas | ⚠️ | Cálculo timezone-aware ✅; cobertura limitada por `take:100` (C3). Lazy init compensa al acceder. |
| 2. Misma combinación últimos 3 días → excluye repetida | ⚠️ | **Desviación**: excluye *cualquier tipo* visto en los últimos 3 días, no "combinación repetida 3+ veces" (G5). |
| 3. `America/Mexico_City` → reset a 00:00 local (no UTC) | ✅ | `startOfLocalDay`/offset vía `Intl.DateTimeFormat` (timezone-aware). |

**Resumen AC**: ✅ 15 · ⚠️ 5 (US4-1, US4-3, US5-3, US6-1, US6-2) · ❌ 0 (ningún AC roto por completo; los ⚠️ son parciales).

---

## 3. Verificación del contrato API

| Endpoint / Evento | Contract | Código | Estado |
|-------------------|----------|--------|--------|
| `GET /missions` 200 `{timestamp, daily[], weekly[], dailyChestUnlocked}` | ✅ | `getMissions` matchea | ✅ |
| `GET /missions/summary` `{dailyCompleted, dailyTotal, weeklyCompleted, weeklyTotal, streak, bestStreak}` | ✅ | `getSummary` matchea | ✅ |
| `GET /missions/:id` detalle `{id, period, type, description, target, current, completed, claimed, reward, periodStart, periodEnd, createdAt}` | ✅ | `getMissionById → formatMission` devuelve **solo** `{id,type,description,target,current,completed,reward,resetsAt}` | ❌ **C1** — faltan `period, claimed, periodStart, periodEnd, createdAt`; sobra `resetsAt` |
| `POST /missions/:id/claim` 200 `{mission{id,type,completed}, reward, dailyChestUnlocked}` + 401/404/400/409 | ✅ | `claimReward` matchea (guard/NotFound/BadRequest/Conflict) | ✅ |
| WS `mission:progress` `{missionId,current,target}` (throttle 2s) | ✅ | `emitProgress` | ✅ |
| WS `mission:completed` `{missionId,type,reward,dailyCompleted,dailyTotal}` | ✅ | `emitMissionCompleted` | ✅ |
| WS `mission:daily_complete` `{chestUnlocked:true}` | ✅ | emit con `chestUnlocked:true` (spec pide también `chestId`) | ⚠️ |
| Formato de error `{statusCode, message}` | ✅ | `AppExceptionFilter` (APP_FILTER) | ✅ |
| **OpenAPI** — endpoints en `shared/openapi/openapi.json` | ✅ | `openapi.json` **sin** `/missions` | ❌ **C2** |

**Hallazgo C1 (detalle)**: `getMissionById` reutiliza `formatMission()` (pensado para el listado) en vez de un formateador de detalle. El DTO `MissionDetailResponseDto` declara `period/claimed/periodStart/periodEnd`, pero la respuesta real no los incluye. El test unitario `returns mission detail` solo verifica campos básicos, por lo que no detecta la desviación.

---

## 4. Cumplimiento de la Constitución

| Artículo | Requisito | Estado | Observación |
|----------|-----------|--------|-------------|
| **I. Backend autoritativo** | `crypto.randomInt`; `userId` de sesión; transacción atómica en claims | ⚠️ | `crypto.randomInt` ✅; `userId`/`timezone` de `@CurrentUser` ✅; el guard `updateMany` **evita duplicar** recompensa bajo concurrencia ✅. PERO el claim no está en `$transaction` (C5) y el progress es read-then-write (riesgo de perder un increment). |
| **II. Combate determinista** | N/A | ✅ | El listener de `battle:finished` solo incrementa un contador; no toca el motor. |
| **III. Contrato único (openapi)** | `openapi.json` regenerado con misiones | ❌ | **C2**: `openapi.json` no contiene `/missions`. El contrato fuente de verdad está desincronizado; los clientes generados no verían la API de misiones. |
| **IV. Lazy tick** | N/A | ✅ | Sin crons por mascota; scheduler por lotes. |
| **V. Tiempo real WS autenticado** | `emitToUser`, JWT handshake, sala `user:<id>` | ✅ | Usa `RealtimeGateway.emitToUser` (sala `user:${userId}`); identidad por JWT. |
| **VI. Arquitectura modular** | `MissionsModule` registrado en `AppModule` | ✅ | Registrado; controllers no tocan Prisma/Redis directamente. |
| **VII. Datos en game-data JSON** | Config en `shared/game-data/*.json` vía `GameDataService` | ✅ | Lee `missions.json` vía `GameDataService.getMissions()`. |
| **VIII. Seguridad** | JWT + guardas; queries filtradas por `userId` de sesión | ✅ | `JwtAuthGuard`; todo query filtra por `userId` de la sesión. |
| **IX. Simplicidad / YAGNI** | `@nestjs/schedule` (in-proc) en vez de BullMQ | ✅ | Cron in-process; sin cola. |

**Veredicto constitución**: 1 falla material (III — openapi desincronizado) y 1 advertencia (I — atomicidad de claim/progress). El resto cumple.

---

## 5. Evidencia de tests ejecutados

`npx jest --testPathPattern src/missions` (2026-11-13):

```
PASS src/missions/mission-scheduler.service.spec.ts
PASS src/missions/mission-tracking.service.spec.ts
PASS src/missions/missions.service.spec.ts
PASS src/missions/missions.controller.spec.ts
Test Suites: 4 passed, 4 total
Tests:       31 passed, 31 total
```
(Los `ERROR ... DB down` son de los tests de manejo de errores del scheduler; esperados.)

- **Falta**: `mission-generation.service.spec.ts` (el plan Paso 4 lo pide: anti-repetición, ponderado, timezone DST).
- **E2E**: `backend/test/missions.e2e-spec.ts` existe (6 casos) pero no cubre WS progress / race condition / reset por timezone.

---

## 6. Gaps encontrados

- **G1 — Contrato de detalle roto (C1).** `GET /missions/:id` devuelve el shape de lista, no el de detalle. `formatMission()` omite `period, claimed, periodStart, periodEnd, createdAt`.
- **G2 — OpenAPI desincronizado (C2).** `shared/openapi/openapi.json` no incluye los endpoints de misiones (ni cofres). `T026` no cumplida; Constitución III.
- **G3 — Cobertura del scheduler (C3).** `take:100` sin paginación → solo ~100 usuarios reciben reset programado. El plan habla de "lotes de 100" pero no hay bucle de paginación ni `orderBy`/cursor.
- **G4 — Cofre diario ausente (C4).** No se crea `Chest`, no hay stub `{chestId:'stub'}`, no se emite `chestId`, y `ChestsModule` (disponible) no está cableado al flujo de misiones.
- **G5 — Anti-repetición desviada.** `getRepeatedTypes()` devuelve *todos* los tipos vistos en los últimos 3 días en vez de las "combinaciones repetidas 3+ veces" (FR-011). Consecuencia: (a) variedad diaria muy limitada y (b) cuando casi todos los tipos fueron recientes, el fallback incluye todo y la anti-repetición se anula.
- **G6 — Claim no atómico (C5, Constitución I).** `updateMany` (claimed) y `user.update` (saldo) son 2 awaits separados, sin `$transaction`. Si el update de saldo falla, queda `claimed:true` sin recompensa y el retry devuelve 409 → recompensa perdida.
- **G7 — Progress no atómico (C5).** `incrementProgress` hace `findMany` → `Math.min` → `update`. Dos eventos concurrentes del mismo tipo pueden leer el mismo `current` y anular un incremento.
- **G8 — Streaks por UTC.** `calculateStreak`/`calculateBestStreak` usan clave de fecha UTC (`periodStart.toISOString().slice(0,10)`) y pasos fijos de 24 h. Para usuarios con timezone ≠ UTC, la racha no coincide con el "día local" (FR-016).
- **G9 — FR-014 no implementado.** Sin contador caliente en Redis ni flush 30 s; persistencia directa a PG. El contrato (Redis keys) solo define `missions:history`, no `missions:progress`. Inconsistencia spec↔contrato.
- **G10 — Tests críticos faltantes.** Sin `mission-generation.service.spec.ts`; E2E sin WS progress / race / reset por timezone.
- **G11 — `mission:daily_complete` sin `chestId`.** El spec/FR-009 pide `{chestUnlocked:true, chestId}`; se emite solo `{chestUnlocked:true}` (coincide con el contrato, pero no con el spec).

---

## 7. Fixes recomendados (cierre de gaps)

- **[G1]** Añadir formateador de detalle para `GET /missions/:id` (extender `formatMission` con `period, claimed, periodStart, periodEnd, createdAt`) y devolver el shape del contrato/DTO. Ajustar el test `returns mission detail`. → `missions.service.ts`, `dto/mission-claim.dto.ts`, `missions.service.spec.ts`.
- **[G2]** Regenerar el contrato: `pnpm export:openapi` y commitear `shared/openapi/openapi.json` con `/missions`. Verificar `MissionListResponseDto`, `ClaimRewardResponseDto`, etc. → `shared/openapi/openapi.json`.
- **[G3]** Scheduler paginado: `orderBy`/cursor + bucle `skip`/`take` (o detectar usuarios por `periodEnd < now`) para cubrir **todos** los usuarios. → `mission-scheduler.service.ts` (+ spec).
- **[G4]** Cofre diario: cablear `ChestsModule` para crear un `Chest { source:'daily_mission' }` al completar todas las diarias (o stub `{chestId:'stub'}`) y emitir `mission:daily_complete {chestUnlocked:true, chestId}`. → `missions.service.ts` / `mission-tracking.service.ts` / `dto/mission.dto.ts`.
- **[G5]** Alinear anti-repetición con FR-011 (excluir *combinaciones* aparecidas 3+ veces en 3 días) o documentar la política estricta. → `mission-generation.service.ts` + **crear** `mission-generation.service.spec.ts`.
- **[G6]** Envolver el claim en `prisma.$transaction`: flip `claimed` (guard `claimed:false`) + increment de saldo en la misma transacción; `count===0` → 409. → `missions.service.ts` (`claimReward`).
- **[G7]** Progress atómico (p. ej. `$transaction` read-then-update, o `update` con incremento condicionado por `completed:false`) para evitar pérdida de incrementos concurrentes. → `mission-tracking.service.ts` (`incrementProgress`).
- **[G8]** Calcular streaks por **fecha local del usuario** (no UTC fija de 24 h). → `missions.service.ts` (`calculateStreak`, `calculateBestStreak`).
- **[G9]** Resolver FR-014: implementar contador caliente en Redis + flush 30 s, **o** enmendar spec+contrato (persistencia directa a PG). Documentar. → `spec.md`/`api-contract.md` o `mission-tracking.service.ts`.
- **[G10]** Completar tests: `mission-generation.service.spec.ts` (anti-repetición, ponderado, DST) y extender `missions.e2e-spec.ts` (WS progress, race 2×claim, reset por timezone). → `backend/src/missions/`, `backend/test/missions.e2e-spec.ts`.
- **[G11]** Añadir `chestId` al payload de `mission:daily_complete` (depende de G4). → `mission-tracking.service.ts`.

---

## 8. Siguiente paso

1. Corregir **G1, G2, G6** (bloquean contrato + Constitución); cambios pequeños de alto impacto.
2. Implementar **G4/G11** (cofre diario) y **G3** (scheduler paginado).
3. Alinear **G5/G8** y decidir **G9** (documentar).
4. Completar **G10** (tests) y re-ejecutar suite unitaria + E2E (`pnpm test` / `pnpm test:e2e`).
5. Re-verificar con este reporte hasta cerrar C1–C5 → **convergencia alcanzada**.

