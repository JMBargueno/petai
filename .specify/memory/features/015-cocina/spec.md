# Feature Specification: Minijuego Cocina

**Feature Branch**: `015-cocina`

**Created**: 2026-01-15

**Status**: Approved

**Input**: User description: "Minijuego cocina — 60s timer, 3-4 ingredientes, buffs de combate, menú del día."

## User Scenarios & Testing

### User Story 1 - Cocinar el Pedido del Pet (Priority: P1)
El jugador inicia la cocina, ve 3-4 ingredientes a cocinar, y los selecciona en orden dentro de 60s.

**Acceptance Scenarios**:
1. **Given** un pet con energía suficiente, **When** POST /v1/cooking/start, **Then** se devuelve una sesión con receta, ingredientes y timer.
2. **Given** una sesión activa, **When** POST /v1/cooking/submit con resultado, **Then** se valida y se otorga un buff si es correcto.

### User Story 2 - Ver el Menú del Día (Priority: P2)
El jugador ve qué receta especial hay hoy.

**Acceptance Scenarios**:
1. **Given** cualquier día, **When** GET /v1/cooking/daily-menu, **Then** se muestra la receta del día (determinista por fecha).

### Edge Cases
- Tiempo agotado (sin buff)
- Ingredientes en orden incorrecto
- 20 sesiones/día (límite)
- Buff stack (cap +15%)

## Requirements

- **FR-001**: System MUST crear sesión de cocina con seed determinista y 60s de duración.
- **FR-002**: System MUST otorgar un buff de combate (ATK/DEF/ESP/VEL +N) al completar correctamente.
- **FR-003**: System MUST tener un "Menú del día" determinista por fecha.
- **FR-004**: System MUST desbloquear recetas por nivel del pet.
- **FR-005**: System MUST respetar límites de minijuego (energía 10, cooldown 15s, 20/día).
- **FR-006**: System MUST capear buffs al +15% de la stat base.

## Success Criteria

- **SC-001**: Sesión completa en <60s con feedback inmediato.
- **SC-002**: Buff visible en próximo combate.
- **SC-003**: Menú del día diferente cada día.

## Assumptions
- Reutiliza infraestructura de minigames existente.
- Buffs se guardan en tabla `CombatBuff`.
- Recetas en `shared/game-data/recipes.json`.