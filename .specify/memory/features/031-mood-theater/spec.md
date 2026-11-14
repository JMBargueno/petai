# Feature Specification: Mood Theater — Micro-narrativas Diarias

**Feature Branch**: `[031-mood-theater]`
**Created**: 2025-02-01
**Status**: Implemented
**Input**: El pet realiza "actos" espontáneos (baile, canto, llanto, humo, brillo, bostezo, estiramiento) según su mood, bonding y contexto. El jugador puede capturar un momento como sticker y compartirlo en un feed social opt-in.

## User Scenarios & Testing

### User Story 1 - Actos espontáneos según contexto (Priority: P1)

Como jugador, quiero que mi pet "actúe" (baille al dar su comida favorita, fume al perder, brille al subir de nivel) según su estado y contexto.

**Why this priority**: Es el núcleo — los micro-momentos de deleite.

**Independent Test**: Con un pet de happiness>85 y hunger>70, llamar `GET /v1/mood-theater/current`; verificar que puede retornar `sing` (según probabilidad) y que se registra un `MoodMoment`.

**Acceptance Scenarios**:
1. **Given** contexto `favoriteFood` con bonding≥60, **When** se consulta current, **Then** el acto es `dance` (100%).
2. **Given** contexto `battleLoss`, **When** se consulta, **Then** `smoke` con 80%.
3. **Given** 3 actos espontáneos hoy, **When** se intenta un 4º countable, **Then** no se produce.

---

### User Story 2 - Captura de stickers (Priority: P2)

Como jugador, quiero "capturar" (long-press) un momento durante un acto y guardarlo como sticker.

**Why this priority**: Crea contenido y colección (galería).

**Independent Test**: Capturar un momento (`POST /v1/mood-theater/capture`); verificar que el `MoodMoment` queda `captured=true` con stickerKey.

**Acceptance Scenarios**:
1. **Given** un acto activo, **When** se captura, **Then** se crea sticker (key) y `capturedAt`.
2. **Given** 50 stickers ya, **When** se captura otro, **Then** el más antiguo se descarta.

---

### User Story 3 - Feed social opt-in (Priority: P3)

Como jugador, quiero ver un feed con actos de otros pets (opt-in, sin datos personales).

**Why this priority**: Comunidad y viralidad.

**Independent Test**: Con varios momentos `sharedToFeed`, llamar `GET /v1/mood-theater/feed`; verificar top 20 de otros usuarios.

**Acceptance Scenarios**:
1. **Given** 30 momentos públicos, **When** se consulta feed, **Then** retorna 20 más recientes (excluyendo los propios).
2. **Given** sin momentos públicos, **When** se consulta, **Then** empty array.

---

### Edge Cases

- Pet enfermo: no hace dance/sing (solo cry/stretch).
- Pet durmiendo: no hace actos (excepto stretch al despertar).
- Personalidad modifica la intensidad (tímido canta suave, etc.).
- Cooldown global: máx 3 actos espontáneos/día.

## Requirements

### Functional Requirements

- **FR-001**: System MUST exponer `GET /v1/mood-theater/current` con el acto actual según contexto/vitals.
- **FR-002**: System MUST exponer `POST /v1/mood-theater/capture` para capturar un sticker.
- **FR-003**: System MUST exponer `GET /v1/mood-theater/feed` con actos públicos de otros.
- **FR-004**: System MUST evaluar triggers con las probabilidades del spec (dance, sing, cry, smoke, glow, yawn, stretch).
- **FR-005**: System MUST limitar a 3 actos espontáneos/día (glow/dance son event-driven y no cuentan).
- **FR-006**: System MUST persistir `MoodMoment` en Prisma.
- **FR-007**: System MUST emitir WS `pet:moment` con `{ petId, act, duration, trigger, mood }`.
- **FR-008**: System MUST limitar la galería de stickers a 50 por pet.

### Key Entities

- **MoodMoment** (nuevo): userId, petId, act, trigger, mood, duration, captured, stickerKey, capturedAt, sharedToFeed

## Success Criteria

### Measurable Outcomes

- **SC-001**: Triggers producen los actos correctos en eventos determinísticos (favoriteFood→dance).
- **SC-002**: Daily cap bloquea el 100% de actos countables del día 4+.
- **SC-003**: Captura crea sticker con key en <300ms.
- **SC-004**: Feed retorna top 20 de otros usuarios en <500ms.

## Assumptions

- `PetsService` provee los vitals del pet (happiness, hunger, energy, health, sick, sleeping, bonding).
- `RealtimeGateway` emite `pet:moment`.
- Sticker key es referencial (generación PNG es client-side según spec).
- Feed opt-in: solo momentos con `sharedToFeed=true`.
