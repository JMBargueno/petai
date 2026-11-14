# Tasks: Accessibility & Inclusion

**Input**: `./spec.md`, `./plan.md`

## Phase 1: Config

- [x] T001 Crear `shared/game-data/accessibility.json` (highContrast, simpleMode, minigames, shortcuts)
- [x] T002 Añadir modelo `AccessibilityPrefs` a `backend/prisma/schema.prisma`
- [x] T003 Crear `accessibility.module.ts`

## Phase 2: Servicio + endpoints (P1)

- [x] T004 [P] `accessibility.service.ts`: `getPrefs` (upsert default), `updatePrefs` (parcial, clamping), `accessibleMinigames`, `config()`
- [x] T005 `accessibility.controller.ts`: `GET /v1/accessibility/prefs`, `PUT /v1/accessibility/prefs`, `GET /v1/accessibility/minigames/accessible`

## Phase 3: Integración

- [x] T006 Registrar `AccessibilityModule` en `app.module.ts`

## Dependencies & Execution Order

1. Config + schema + module
2. Service → controller
3. Registro global
