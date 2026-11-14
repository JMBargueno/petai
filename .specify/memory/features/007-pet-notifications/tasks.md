---
description: "Task list for feature 007-pet-notifications implementation"
---

# Tasks: Pet Notifications con Personalidad

**Input**: Design documents from `.specify/memory/features/007-pet-notifications/`

**Prerequisites**: plan.md ✅, spec.md ✅, contracts/api-contract.md ✅

**Tests**: Tests unitarios (`.spec.ts`) en el motor `notification-rules.ts` y en `NotificationDispatcherService`. Test E2E en `backend/test/notifications.e2e-spec.ts`.

**Organization**: Tareas agrupadas por user story para implementación independiente.

## Format: `[ID] [P?] [Story] Descripción`

- **[P]**: Puede ejecutarse en paralelo (archivos diferentes, sin dependencias)
- **[Story]**: A qué user story pertenece (US1, US2, US3)
- Incluyen ruta exacta de archivo en la descripción

## Path Conventions

- **Backend (NestJS)**: `backend/src/`
- **Tests unitarios**: `backend/src/modules/notifications/*.spec.ts`
- **Tests E2E**: `backend/test/`
- **Prisma**: `backend/prisma/`
- **Shared config**: `shared/game-data/`
- **OpenAPI**: `shared/openapi/`
- **Desktop (Tauri + Svelte)**: `desktop/src/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Datos de plantillas y esquema de datos (sin código de feature aún)

- [ ] T001 [P] Crear `shared/game-data/notifications.json` [NUEVO]: estructura JSON con `$schema` draft-07; secciones por `personality` (valiente/timido/travieso/dulce/curioso/neutral) → `bondingTier` (acquainted/companion/ally/soulmate/legend) → `category` (vitals_critical/interaction/achievement/arena/event) con 1-2 frases por combinación. Total 180 entradas mínimas.
  - Depende de: nada
  - **Archivo**: `shared/game-data/notifications.json`
  - **Nota**: Revisión UX requerida. Estructura: `{ "$schema": "...", "version": "1.0", "templates": { "valiente": { "acquainted": { "vitals_critical": ["..."], ... }, ... }, ... } }`

- [ ] T002 [P] Modificar `backend/prisma/schema.prisma`: añadir a `User` el campo `notificationPrefs Json?`. Generar migración (`pnpm --filter backend prisma migrate dev --name add_notification_prefs`)
  - Depende de: nada
  - **Archivo**: `backend/prisma/schema.prisma` + migración

- [ ] T003 [P] Añadir sección `notifications` a `shared/game-data/balance.json`: `vitals.criticalThreshold` (10), `quietHours.start` (23), `quietHours.end` (7), `rateLimit.defaultMaxPerDay` (3), `dedup.windowMinutes` (5). Incrementar `version`.
  - Depende de: nada
  - **Archivo**: `shared/game-data/balance.json`

**Checkpoint**: `notifications.json` cargable por `GameDataService`; `User.notificationPrefs` migrado; `balance.json` con thresholds

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Módulo de dominio, motor puro y servicios que BLOQUEAN todas las user stories

**⚠️ CRÍTICO**: Ninguna user story puede implementarse hasta completar esta fase

- [ ] T004 Crear `backend/src/modules/notifications/notification-rules.ts` [NUEVO]: motor **puro** (sin deps de Nest): `isInQuietHours(date, timezone, start, end)` → bool, `shouldRateLimit(count, maxPerDay)` → bool, `shouldDedup(existingKey, windowMs)` → bool, `resolveTemplate(templates, trait, tier, category)` → string (fallback neutral), `resolveDefaults(prefs)` → `NotificationPrefs`. Exporta tipos.
  - Depende de: T001, T003
  - **Archivo**: `backend/src/modules/notifications/notification-rules.ts`

- [ ] T005 [P] Crear `backend/src/modules/notifications/notification-rules.spec.ts` [NUEVO]: tests del motor puro — `isInQuietHours` (fronteras 23:00/07:00, DST), `shouldRateLimit` (2/3→false, 3/3→true, maxPerDay=0→true), `shouldDedup`, `resolveTemplate` (caso exacto, fallback neutral, tier desconocido), `resolveDefaults` (null→defaults, parcial→merge)
  - Depende de: T004
  - **Nota**: Tests **FAIL** antes de implementar (TDD)

- [ ] T006 Crear `backend/src/modules/notifications/notification-generator.service.ts` [NUEVO]: inyecta `PrismaService`, `GameDataService`, `AiService`. Método `generate(petId, userId, category, context)` → `{ message, source }`. Lógica: obtener Pet+AiConfig → si AiConfig: LLM call (50 tokens, 5s timeout) → si fail: `resolveTemplate`; si no AiConfig: `resolveTemplate` directo.
  - Depende de: T004, T001
  - **Archivo**: `backend/src/modules/notifications/notification-generator.service.ts`

- [ ] T007 Crear `backend/src/modules/notifications/notification-dispatcher.service.ts` [NUEVO]: inyecta `PrismaService`, Redis client, `GameDataService`, `NotificationGeneratorService`, `RealtimeGateway`, `EventEmitter`. Método `dispatch(userId, petId, category, context)`: (1) obtener User (prefs, timezone) → verificar toggle (2) quiet hours (3) dedup Redis key 5min (4) rate limit Redis INCR+EXPIRE 24h (5) si pasa: `generator.generate()` → `realtimeGateway.emitToUser(userId, 'pet:notification', payload)` (6) set dedup key.
  - Depende de: T004, T006
  - **Archivo**: `backend/src/modules/notifications/notification-dispatcher.service.ts`

- [ ] T008 [P] Crear `backend/src/modules/notifications/dto/notification-prefs.dto.ts` [NUEVO]: DTO con Swagger + Zod: `vitals_critical?`, `interaction?`, `achievement?`, `arena?`, `event?` (bool), `maxPerDay?` (1-10). Default: todas true, maxPerDay=3.
  - Depende de: T004
  - **Archivo**: `backend/src/modules/notifications/dto/notification-prefs.dto.ts`

- [ ] T009 [P] Crear `backend/src/modules/notifications/notifications.module.ts` [NUEVO]: `@Module` importa PrismaModule, RedisModule, GameDataModule, AiModule, RealtimeModule; registra providers.
  - Depende de: T006, T007
  - **Archivo**: `backend/src/modules/notifications/notifications.module.ts`

- [ ] T010 Crear `backend/src/modules/notifications/notification-dispatcher.spec.ts` [NUEVO]: tests (mock Redis, Prisma, Generator, RealtimeGW): rate limit (4→3), dedup (5/4min→1), quiet hours (03:00→0), toggle off, maxPerDay custom
  - Depende de: T007
  - **Nota**: Tests **FAIL** antes (TDD)

- [ ] T011 Registrar `NotificationsModule` en `backend/src/app.module.ts` (tras `EnvironmentalModule`)
  - Depende de: T009
  - **Archivo**: `backend/src/app.module.ts`

**Checkpoint**: Motor puro testado; Generator + Dispatcher implementados; módulo registrado

---

## Phase 3: User Story 1 - "Mi pet me habla en su propio tono" (Priority: P1) 🎯 MVP

**Goal**: Generación personalizada + hooks de eventos que disparan notificaciones

**Independent Test**: Evento `vitals_critical` para pet con personalidad → WS `pet:notification` con mensaje tonal

### Implementation for User Story 1

- [ ] T012 [P] [US1] Integrar hook vitales en `backend/src/modules/pets/pets.service.ts`: en `applyLazyTick`, si `hunger < criticalThreshold` → emitir evento `pet:vitals-critical` vía EventEmitter. El dispatcher se suscribe y llama `dispatch(userId, petId, 'vitals_critical', { stat, value })`.
  - Depende de: T011
  - **Archivo**: `backend/src/modules/pets/pets.service.ts`

- [ ] T013 [P] [US1] Integrar hooks en servicios existentes: `battles.service.ts` → `pet:battle-won`; `missions.service.ts` → `pet:mission-completed`; hooks de interaction. Suscripción en dispatcher vía `@OnEvent` → `dispatch(...)` con categoría.
  - Depende de: T011
  - **Archivos**: battles, missions, notification-dispatcher

- [ ] T014 [US1] Test de integración `backend/test/notifications.e2e-spec.ts` [NUEVO]: crear user+pet → disparar evento vitals → verificar WS `pet:notification` con mensaje (con/sin IA)
  - Depende de: T012, T013
  - **Archivo**: `backend/test/notifications.e2e-spec.ts`

**Checkpoint**: MVP — pet genera notificaciones personalizadas vía WS

---

## Phase 4: User Story 2 - "Que no me spamee mi pet" (Priority: P2)

**Goal**: Rate limit (Redis), dedup (5 min), quiet hours, toggles, `PATCH/GET /me`

**Independent Test**: 4 eventos mismo día → 3 emitidas; 4 eventos misma cat en 4 min → 1; toggle off → 0; 03:00 → 0

### Implementation for User Story 2

- [ ] T015 [P] [US2] Ampliar `PATCH /me` en `users.controller.ts` + `users.service.ts`: aceptar `notificationPrefs` (DTO T008). Merge parcial (solo campos presentes). Documentar con Swagger.
  - Depende de: T008, T011
  - **Archivo**: `backend/src/users/users.controller.ts`, `backend/src/users/users.service.ts`

- [ ] T016 [P] [US2] Ampliar `GET /me`: incluir `notificationPrefs` en respuesta (defaults resueltos si null). Documentar con Swagger.
  - Depende de: T008
  - **Archivo**: `backend/src/users/users.controller.ts`

- [ ] T017 [US2] Tests E2E `PATCH/GET /me` con prefs: merge parcial, maxPerDay=5, toggle off verificado en dispatch
  - Depende de: T015, T016
  - **Archivo**: `backend/test/notifications.e2e-spec.ts`

- [ ] T018 [US2] Verificar dispatcher aplica rate limit + dedup + quiet hours. Tests edge: maxPerDay=0 (todas bloqueadas), maxPerDay=5, zona con DST
  - Depende de: T010, T015
  - **Archivo**: `backend/src/modules/notifications/notification-dispatcher.spec.ts`

**Checkpoint**: Rate limit, dedup, quiet hours, toggles y endpoints funcionales

---

## Phase 5: User Story 3 - "Lo veo en mi escritorio" (Priority: P3)

**Goal**: WS listener → Tauri notification; NotificationSettingsPanel; inbox offline; tray badge

**Independent Test**: Mock WS `pet:notification` → notificación nativa. Panel → toggles llaman `PATCH /me`. Offline → inbox

### Implementation for User Story 3

- [ ] T019 [P] [US3] Crear `desktop/src/lib/notification-handler.ts` [NUEVO]: suscripción WS `pet:notification` → `tauri-plugin-notification.sendNotification({ title: petName, body: message, image })`. Offline → guardar en inbox.
  - Depende de: T014
  - **Archivo**: `desktop/src/lib/notification-handler.ts`

- [ ] T020 [P] [US3] Crear `desktop/src/lib/notification-inbox.ts` [NUEVO]: store Svelte con notificaciones pendientes. Reconexión → flush. Expose `unreadCount` para tray badge.
  - Depende de: T019
  - **Archivo**: `desktop/src/lib/notification-inbox.ts`

- [ ] T021 [P] [US3] Crear `desktop/src/components/NotificationSettingsPanel.svelte` [NUEVO]: 5 toggles + slider maxPerDay (1-10). Montar → `GET /me`. Cambio → `PATCH /me`.
  - Depende de: T015, T016
  - **Archivo**: `desktop/src/components/NotificationSettingsPanel.svelte`

- [ ] T022 [US3] Integrar en `desktop/src/main.ts`: inicializar handler al conectar WS; tray badge con `unreadCount`; incluir panel en settings
  - Depende de: T019, T020, T021
  - **Archivo**: `desktop/src/main.ts`, `desktop/src/App.svelte`

**Checkpoint**: Notificaciones visibles en escritorio; panel funcional; inbox offline

---

## Phase 6: Polish & Integration

- [ ] T023 [P] Regenerar `shared/openapi/openapi.json` (`pnpm export:openapi`). Verificar tipos para escritorio
  - Depende de: T015, T016
  - **Archivo**: `shared/openapi/openapi.json`

- [ ] T024 [P] Tests E2E completos `backend/test/notifications.e2e-spec.ts`: IA mock → 3 notifs; sin IA → plantillas; timeout → fallback; rate limit; quiet hours; toggle off; dedup
  - Depende de: T014, T017, T018
  - **Archivo**: `backend/test/notifications.e2e-spec.ts`

- [ ] T025 [P] Actualizar `backend/.env.example`: documentar `NOTIFICATIONS_DEFAULT_MAX_PER_DAY` (optional)
  - Depende de: nada
  - **Archivo**: `backend/.env.example`

**Checkpoint**: OpenAPI actualizado; todos tests pasan; feature completa

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational
  - US2 y US3 se integran con US1 pero son testeables por sí solas
- **Polish (Phase 6)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: Arranca tras Foundational — sin dependencias de otras stories
- **US2 (P2)**: Arranca tras Foundational; usa el dispatcher de US1
- **US3 (P3)**: Arranca tras Foundational; consume WS event + prefs API de US1/US2

### Within Each User Story

- Motor puro + tests antes de servicios
- Servicios antes de hooks/integraciones
- Hooks antes de tests E2E
- Story completa antes de la siguiente prioridad

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 en paralelo
- **Phase 2**: T005 ∥ T004; T008 ∥ T006; T009 ∥ T010
- **US1**: T012 ∥ T013
- **US2**: T015 ∥ T016
- **US3**: T019 ∥ T020 ∥ T021
- **Cross-story**: US1, US2, US3 en paralelo (3 devs tras Phase 2)
- **Phase 6**: T023, T024, T025 en paralelo

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001-T003)
2. Phase 2: Foundational (T004-T011) — CRÍTICO
3. Phase 3: US1 (T012-T014)
4. **PARAR Y VALIDAR**: evento vitals → WS con mensaje tonal
5. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → Fundación
2. US1 → Test → **MVP!**
3. US2 → Test → rate limit + prefs
4. US3 → Test → UI escritorio
5. Cada story agrega valor sin romper anteriores

### Parallel Team Strategy (3 devs)

1. **Juntos**: Setup + Foundational (~1 día)
2. **Tras Phase 2**: Dev A → US1; Dev B → US2; Dev C → US3
3. **Juntos**: Phase 6
4. Stories se integran independientemente

---

## Notes

- [P] tasks = archivos diferentes, sin dependencias
- [Story] label para trazabilidad
- Cada story debe ser completada y testeada de forma independiente
- **YA EXISTEN**: `RealtimeGateway`, `AiModule`, `GameDataService`, `RedisModule`, `EventEmitterModule`, `PATCH/GET /me`, `User.timezone`, `Pet.personality/bondingTier`, Tauri notification plugin
- Trabajo principal:
  - Crear `modules/notifications/` (motor + 2 servicios + DTO + módulo)
  - Crear `notifications.json` + ampliar `balance.json`
  - `User.notificationPrefs` (migración)
  - Extender `PATCH/GET /me`
  - Suscribir dispatcher a eventos existentes
  - Handler WS + panel + inbox en escritorio
  - Tests unitarios + E2E
- Commitear tras cada task
- Parar en cada checkpoint para validar