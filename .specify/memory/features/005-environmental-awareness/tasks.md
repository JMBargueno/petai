---
description: "Task list for feature 005-environmental-awareness"
---

# Tasks: Environmental Awareness & Mood Weather

**Input**: Design documents from `.specify/memory/features/005-environmental-awareness/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), contracts/api-contract.md

**Tests**: La spec solicita tests (unit + integration + edge), así que se incluyen tareas de test por historia.

**Format**: `[ID] [P?] [Story] Description` — `[P]` = puede correr en paralelo (archivos distintos, sin dependencias); `[Story]` = historia a la que pertenece (US1, US2, US3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Base de datos, datos de juego y esqueleto del módulo.

- [ ] T001 Crear el esqueleto del módulo `backend/src/modules/environmental/` (`environmental.module.ts`, `environmental.controller.ts`, `environmental.service.ts`, `environmental.types.ts`) y registrar `EnvironmentalModule` en `backend/src/app.module.ts`
- [ ] T002 [P] Añadir la sección `environmental` (`hot_temp`, `cold_temp`, `hunger_hot`, `happiness_rain`, `energy_snow`, `inactivityThresholdHours`) a `shared/game-data/balance.json` y aumentar su `version`
- [ ] T003 [P] Crear `shared/game-data/festivals.json` con la estructura `[{ id, name, monthStart, dayStart, monthEnd?, dayEnd?, region?, accessory, message }]` y sembrar festividades base
- [ ] T004 [P] Añadir `latitude Float?`, `longitude Float?` y `birthday String?` al modelo `User` en `backend/prisma/schema.prisma`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura que DEBE estar lista antes de cualquier historia (mapeadores puros, servicios de datos, endpoints base).

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta completar esta fase.

- [ ] T005 Ejecutar la migración Prisma para los nuevos campos de `User` y regenerar el client; expone `latitude`/`longitude` (opt-in) vía el endpoint de actualización de perfil en `backend/src/modules/users/users.controller.ts`
- [ ] T006 [P] Implementar el mapeador puro `backend/src/modules/environmental/weather.mapper.ts` (código WMO + temperatura → `condition`) con test de unidad `weather.mapper.spec.ts`
- [ ] T007 [P] Implementar la función pura `backend/src/modules/environmental/time-of-day.ts` (`(Date, timeZone) → timeOfDay`) con test de unidad `time-of-day.spec.ts` (incluye caso DST)
- [ ] T008 [P] Implementar `backend/src/modules/environmental/weather.service.ts`: fetch de Open-Meteo (allowlist SSRF, timeout 3 s), cache en Redis `weather:{lat}:{lon}` (TTL 30 min) y fallback a último cacheado / `unknown`
- [ ] T009 [P] Implementar `backend/src/modules/environmental/activity-tracker.service.ts`: guardado del heartbeat en Redis `activity:{userId}` (TTL 3 h) y clasificación `"active"` / `"solo"` según `inactivityThresholdHours`
- [ ] T010 [P] Implementar `backend/src/modules/environmental/festival.service.ts`: lookup de festividad activa y de próximas por fecha+región desde `festivals.json` (vía `GameDataService`)
- [ ] T011 Implementar `backend/src/modules/environmental/environmental.service.ts`: compone `EnvironmentalStatus { timeOfDay, weather, activity, festival }` orquestando weather/time-of-day/activity/festival
- [ ] T012 Implementar los endpoints del controller con DTOs de `@nestjs/swagger` (`GET /environmental/status`, `POST /environmental/activity`, `GET /environmental/festivals/upcoming`) y regenerar `shared/openapi/openapi.json` (`pnpm export:openapi`)

**Checkpoint**: Fundamento listo — puede empezar la implementación de las historias en paralelo.
---

## Phase 3: User Story 1 - "El pet siente el mundo": hora + clima (Priority: P1) 🎯 MVP

**Goal**: `GET /environmental/status` devuelve hora del día y clima real (cache + fallback) y el clima modifica los vitales dentro del lazy tick.

**Independent Test**: Con un mock de Open-Meteo, `GET /environmental/status` responde `{ timeOfDay, weather, ... }` correctamente; con coordenadas se verifica cache (segunda llamada sin upstream) y fallback (API caída → `unknown`); un lazy tick de 3 h con `weather=hot` decremente `hunger` el extra de `hunger_hot`.

### Tests for User Story 1 (escribir PRIMERO, deben fallar)

- [ ] T013 [P] [US1] Test de unidad del modificador de vitales en `backend/src/modules/pets/pets.service.spec.ts` (simula lazy tick de 3 h con `condition=hot/rain/snow`)

### Implementation for User Story 1

- [ ] T014 [US1] Cablear `timeOfDay` (T007) + `weather` (T008) en la respuesta de `GET /environmental/status` (`environmental.service.ts`)
- [ ] T015 [US1] Añadir el hook de modificadores ambientales dentro de `applyLazyTick` en `backend/src/modules/pets/pets.service.ts` (lee `gameData.getBalance().environmental` + `condition` actual; acota a [0, max])

### Validación de User Story 1

- [ ] T016 [US1] Test E2E en `backend/test/environmental.e2e-spec.ts`: `GET /environmental/status` con weather mock (casos upstream, cache, API down) → forma y degradación correctas

**Checkpoint MVP**: US1 completa y testeable por sí sola.

---

## Phase 4: User Story 2 - Inactividad → modo solo (Priority: P2)

**Goal**: El escritorio manda heartbeats; si pasan >2 h sin heartbeat, el pet entra en modo `"solo"`.

**Independent Test**: `POST /environmental/activity` → `GET /environmental/status` con `activity.mode="active"`; tras omitir heartbeats >2 h, `activity.mode="solo"`; al reenviar, vuelve a `"active"` y se emite `environmental:changed`.

### Tests for User Story 2

- [ ] T017 [P] [US2] Test de unidad del umbral de inactivity en `activity-tracker.service.spec.ts` (reciente → active; >2 h → solo; retorno → active)

### Implementation for User Story 2

- [ ] T018 [US2] Endpoint `POST /environmental/activity` con validación/normalización del body (`{ active, cpuUsage? }`) y rate limiting en `environmental.controller.ts`
- [ ] T019 [US2] Integrar la clasificación de actividad en `GET /environmental/status` (`activity-tracker.service.ts`)
- [ ] T020 [US2] Emitir `environmental:changed` (`type: "activity"`) al transitar a/ desde `"solo"` vía `RealtimeGateway.emitToUser`

### Validación de User Story 2

- [ ] T021 [US2] Test E2E heartbeat → inactividad → `solo` → retorno `active` (+ evento WS) en `backend/test/environmental.e2e-spec.ts`

**Checkpoint**: US2 completa y testeable por sí sola.

---

## Phase 5: User Story 3 - Festividades + expresión + IA (Priority: P3)

**Goal**: El pet celebra festividades (accesorio + frase), expone las próximas, y su prompt de IA conoce el contexto ambiental; el escritorio renderiza el overlay.

**Independent Test**: Con `festivals.json` sembrado, `GET /environmental/status` devuelve `festival={...}` y `GET /environmental/festivals/upcoming` lista con `daysRemaining`; el prompt de sistema del pet incluye el bloque de contexto; el overlay dibuja el accesorio.

### Tests for User Story 3

- [ ] T022 [P] [US3] Test de unidad del lookup de festividad (hoy → festival; nada → null) en `festival.service.spec.ts`
- [ ] T023 [P] [US3] Test de unidad en `backend/src/modules/ai/personality.spec.ts`: `buildSystemPrompt` incluye el bloque de contexto `{ timeOfDay, weather, festival }`

### Implementation for User Story 3

- [ ] T024 [US3] Integrar la festividad activa (accesorio + mensaje) en `GET /environmental/status`
- [ ] T025 [US3] Endpoint `GET /environmental/festivals/upcoming` (lista con `daysRemaining`) en `environmental.controller.ts`
- [ ] T026 [US3] Extender `buildSystemPrompt` en `backend/src/modules/ai/personality.ts` para aceptar contexto ambiental opcional y pasarlo desde `buildContext` en `backend/src/modules/ai/chat.service.ts`
- [ ] T027 [US3] Emitir `environmental:changed` (`type: "weather" | "timeOfDay" | "festival"`) al cambiar condiciones relevantes
- [ ] T028 [P] [US3] Crear el cliente de escritorio `desktop/src/lib/environmental.ts` (heartbeat `POST /environmental/activity` cada 60 s + fetch de status)
- [ ] T029 [P] [US3] Crear `desktop/src/components/EnvironmentalOverlay.svelte` (accesorios: paraguas, gorro) y añadir variantes por `timeOfDay`/`weather` en `desktop/src/components/PetView.svelte`
- [ ] T030 [US3] Cablear `desktop/src/App.svelte`: geolocalización opt-in, arrancar el heartbeat, manejar `environmental:changed` y renderizar el overlay

**Checkpoint**: US3 completa; punta-a-punta demo en el escritorio.

---

## Phase 6: Polish & Cross-Story

- [ ] T031 [P] Regenerar `shared/openapi/openapi.json` y validar que el contrato coincide con `contracts/api-contract.md`
- [ ] T032 [P] Documentar los endpoints en `docs/API.md` y actualizar el criterio "Hecho cuando" en `docs/PROYECTO.md`
- [ ] T033 Ejecutar la suite completa (unit + e2e) y validar quickstart ponta-a-punta
---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: Depende de Setup (especialmente la migración T005 y los JSON T002/T003) — **BLOQUEA** todas las historias.
- **User Stories (Phase 3+)**: Todas dependen del final de Foundational.
  - Pueden avanzar en paralelo (si hay capacidad) o en orden de prioridad (P1 → P2 → P3).
- **Polish (Phase 6)**: Depende de que las historias deseadas estén completas.

### User Story Dependencies

- **User Story 1 (P1)**: Puede empezar tras Foundational (Phase 2). Sin dependencias de otras historias.
- **User Story 2 (P2)**: Puede empezar tras Foundational. Reutiliza `environmental.service.ts`/controller de US1 pero es testeable en aislamiento.
- **User Story 3 (P3)**: Puede empezar tras Foundational; reutiliza el estado de US1/US2 (weather/festival) y el controller; testeable en aislamiento.

### Within Each User Story

- Los tests (T013, T017, T022, T023) se escriben PRIMERO y deben fallar antes de implementar.
- Servicios/mapeadores puros antes que el orquestador (`environmental.service.ts`).
- Orquestador antes que los endpoints/controller.
- Núcleo de backend antes que la integración del escritorio.
- Cerrar una historia antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- En Phase 1: T002, T003 y T004 son `[P]` (archivos distintos).
- En Phase 2: T006, T007, T008, T009 y T010 son `[P]` (mapeadores/servicios independientes).
- Tras Foundational: US1, US2 y US3 pueden avanzar en paralelo.
- Tareas `[P]` de tests dentro de cada historia corren en paralelo; el escritorio (T028/T029) en paralelo con el backend de US3.

---

## Notes

- `[P]` = archivos distintos, sin dependencias entre sí.
- La etiqueta `[USn]` traza cada tarea a su historia para independencia y verificación.
- Cada historia debe poder completarse y testearse por sí sola (MVP incremental).
- Verificar que los tests fallan antes de implementar (TDD).
- Commit tras cada tarea o grupo lógico.
- Detener en cada checkpoint para validar la historia de forma independiente.
- Evitar: tareas vagas, conflictos en el mismo archivo, dependencias cruzadas entre historias que rompan la independencia.
- **Constitución**: respetar autoritatividad (I), lazy tick (IV, no cron), contrato único (III, `@nestjs/swagger` → `openapi.json`), datos por `balance.json` (VII), WS autenticado (V) y seguridad/SSRF (VIII).


