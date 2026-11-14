# Feature Specification: Accessibility & Inclusion

**Feature Branch**: `[032-accessibility]`
**Created**: 2025-02-02
**Status**: Implemented
**Input**: Sistema de accesibilidad integral (alto contraste, reducir movimiento, subtítulos, minijuegos alternativos sin timing, "modo simple", color-blind, reduced haptics) con panel centralizado y prefs persistidas. Amplía TAM y genera goodwill.

## User Scenarios & Testing

### User Story 1 - Panel de preferencias de accesibilidad (Priority: P1)

Como usuario, quiero activar/desactivar opciones de accesibilidad (alto contraste, reducir movimiento, subtítulos, modo simple, haptics) desde un panel centralizado y que se persistan.

**Why this priority**: Es la entrada única a toda la accesibilidad.

**Independent Test**: `PUT /v1/accessibility/prefs` con `{ highContrast: true }`; luego `GET /v1/accessibility/prefs` debe reflejar el cambio.

**Acceptance Scenarios**:
1. **Given** prefs por defecto, **When** se activa `highContrast`, **Then** `GET /prefs` lo retorna activo.
2. **Given** prefs guardadas, **When** se consulta en otro dispositivo, **Then** las mismas prefs (sync vía BD).

---

### User Story 2 - Minijuegos accesibles (Priority: P2)

Como usuario con discapacidad motora, quiero minijuegos que NO dependan de reflejos/timing.

**Why this priority**: Permite jugar sin barreras motoras.

**Independent Test**: `GET /v1/accessibility/minigames/accessible` retorna las variantes accesibles con sus parámetros (catch_food_easy, memory_match_easy, reflex_easy).

**Acceptance Scenarios**:
1. **Given** un minigame `catch_food`, **When** se consulta variantes accesibles, **Then** retorna parámetros (velocidad 0.5x, zona 3x, sin timeout).
2. **Given** minijuegos accesibles, **When** se completan, **Then** dan los mismos rewards (spec Q4).

---

### User Story 3 - Modo simple y configuraciones avanzadas (Priority: P3)

Como niño de 7 años / usuario con necesidades cognitivas, quiero un "modo simple" (UI limpia, no infantilización) y opciones de color-blind / tamaño de texto.

**Why this priority**: Amplía inclusión sin "ridiculizar".

**Independent Test**: Activar `simpleMode` y `colorblindMode`; verificar que persisten y que la config de modo simple se expone.

**Acceptance Scenarios**:
1. **Given** modo simple activado, **When** se consulta prefs, **Then** `simpleMode=true` y se exponen parámetros (btnSize 56, textMax 15, aiMaxSentences 2).
2. **Given** `colorblindMode=deuteranopia`, **When** persiste, **Then** los patrones usan textura+color.

---

### Edge Cases

- Prefs por defecto: captions=true, resto false, fontSizeScale=100.
- `prefers-reduced-motion` del OS → reduce motion por defecto (hint al cliente).
- Valores fuera de rango (fontSizeScale >200) → clamp.
- Actualización parcial (PUT con solo algunos campos) → no borra los demás.

## Requirements

### Functional Requirements

- **FR-001**: System MUST exponer `GET /v1/accessibility/prefs` con las prefs del usuario.
- **FR-002**: System MUST exponer `PUT /v1/accessibility/prefs` para actualizar prefs (upsert, parcial).
- **FR-003**: System MUST exponer `GET /v1/accessibility/minigames/accessible` con variantes accesibles.
- **FR-004**: System MUST persistir `AccessibilityPrefs` en Prisma (1 por usuario).
- **FR-005**: System MUST exponer la config de accesibilidad (alto contraste, modo simple, minijuegos, atajos) desde `accessibility.json`.
- **FR-006**: System MUST clamping de `fontSizeScale` (50–200) y validar `colorblindMode`.
- **FR-007**: System MUST soportar actualización parcial de prefs.

### Key Entities

- **AccessibilityPrefs** (nuevo): userId, highContrast, reduceMotion, captions, simpleMode, reduceHaptics, fontSizeScale, colorblindMode

## Success Criteria

### Measurable Outcomes

- **SC-001**: Prefs persisten y se recuperan correctamente (100%).
- **SC-002**: Variantes accesibles expuestas con parámetros válidos.
- **SC-003**: `PUT` parcial no borra campos no enviados.
- **SC-004**: `GET /prefs` responde en <100ms.

## Assumptions

- Config centralizada en `shared/game-data/accessibility.json` (leída por el servicio).
- La aplicación real de los tokens (CSS, ARIA, IA prompt) es del frontend; el backend solo persiste y expone config.
- 1 registro `AccessibilityPrefs` por usuario (unique userId).
