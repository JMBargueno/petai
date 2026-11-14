# Feature Specification: Modding API + Workshop de Pets

**Feature Branch**: `024-modding`

**Created**: 2025-01-14

**Status**: Approved

**Input**: User description: "Sistema de modding con API para publicar especies custom (JSON+SVG), muebles de hábitat y minijuegos sandbox. Workshop in-app con ratings, downloads y featured. Los mods operan en sandbox (solo datos, no código server-side)."

## User Scenarios & Testing

### User Story 1 - Publicar un Mod (Priority: P1)

Como creator, quiero publicar una especie nueva (JSON + SVG + stats) para que otros la usen.

**Why this priority**: Es la entrada al flujo de UGC. Sin publicación no hay nada en el workshop.

**Independent Test**: `POST /v1/modding/publish` con un payload válido crea un `Mod` con `status=published`.

**Acceptance Scenarios**:
1. **Given** un usuario autenticado, **When** publica un mod de tipo `species` con JSON válido y SVG < 500KB, **Then** se crea un `Mod` `published` con preview (sprite + stats).
2. **Given** un payload con SVG que contiene `<script>` o `on*`, **When** lo publica, **Then** recibe 400 (SVG no sanitizado).
3. **Given** un usuario que ya publicó 5 mods hoy, **When** publica otro, **Then** recibe 429 (rate limit 5/día).

---

### User Story 2 - Explorar el Workshop (Priority: P1)

Como jugador, quiero explorar y filtrar el workshop por elemento, rarity, downloads y rating.

**Why this priority**: Es el descubrimiento del contenido de la comunidad.

**Independent Test**: `GET /v1/modding/workshop?element=&rarity=&sort=` devuelve una paginación de mods `published`.

**Acceptance Scenarios**:
1. **Given** 100 mods publicados, **When** filtro por `element=fire&sort=downloads`, **Then** recibo la página ordenada por downloads desc.
2. **Given** un mod `hidden`, **When** consulto el workshop, **Then** no aparece en la lista.

---

### User Story 3 - Rating (Priority: P2)

Como jugador, quiero rating un mod (1-5 estrellas) para ayudar a otros a encontrar buenos mods.

**Why this priority**: Da valor social al contenido.

**Independent Test**: `POST /v1/modding/:id/rate` actualiza `avgRating`/`ratingCount`; min 3 ratings para mostrar promedio.

**Acceptance Scenarios**:
1. **Given** un mod sin ratings, **When** 3 usuarios lo ratan, **Then** el workshop muestra el promedio.
2. **Given** un usuario que ya rató, **When** ratá de nuevo, **Then** se actualiza su rating (upsert por [modId, userId]).

---

### User Story 4 - Moderación (Priority: P2)

Como admin, quiero ocultar/borrar mods inapropiados para mantener la calidad.

**Independent Test**: 3 reports → `status=hidden`; `GET /v1/modding/:id` sigue serviendo el snapshot a quienes lo usan.

**Acceptance Scenarios**:
1. **Given** un mod con 3 reports, **When** se procesa el 3er report, **Then** `status=hidden`.
2. **Given** un mod `hidden`, **When** el admin lo restaura, **Then** `status=published`.

### Edge Cases

- SVG con `foreignObject` o URLs externas → 400.
- Stats extremos (max 999) en el schema → 400.
- Rate limit: 5 mods/día por user.
- Rating race condition: upsert idempotente, sin duplicados.

## Requirements

### Functional Requirements

- **FR-001**: `POST /v1/modding/publish` DEBE validar el JSON por tipo de mod y el SVG (max 500KB, sin scripts).
- **FR-002**: `GET /v1/modding/:id` DEBE devolver el detalle de un mod (snapshot inmutable).
- **FR-003**: `GET /v1/modding/workshop` DEBE listar/buscar/filtrar por element, rarity, sort, page, limit.
- **FR-004**: `POST /v1/modding/:id/rate` DEBE soportar 1-5 estrellas, upsert por usuario, y actualizar promedio.
- **FR-005**: 3 reports DEBE ocultar el mod (pending review).
- **FR-006**: El creator DEBE poder editar/borrar su mod; los pets ya hatch conservan el snapshot.
- **FR-007**: Rate limit: 5 mods/día por user (Redis, con respaldo en DB).
- **FR-008**: Los mods son solo datos (JSON+SVG); el minijuego custom se valida al publicar y corre en sandbox client-side (Web Worker).

### Key Entities

- **Mod**: id, creatorId, type (species|furniture|minigame), name, description, element?, rarity?, data Json, spriteUrl?, minigameUrl?, status (published|hidden|deleted), downloads, avgRating, ratingCount, reportCount, isFeatured, timestamps.
- **ModRating**: id, modId, userId, stars, @@unique([modId, userId]).
- **ModReport**: id, modId, userId, reason, details?, reviewed, createdAt.
- **ModDownload**: id, modId, userId, petId?, @@unique([modId, userId, petId]).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Workshop query indexada: 10k mods → <50ms.
- **SC-002**: El promedio de rating se agrega en `Mod.avgRating` sin JOIN (O(1) en listado).
- **SC-003**: 100% de los SVG con `<script>`/`on*` son rechazados (tests de seguridad).
- **SC-004**: Un mod con 3 reports se oculta automáticamente sin intervención manual.

## Assumptions

- Storage de assets (S3/R2) está disponible; el backend guarda `spriteUrl`/`minigameUrl`.
- El hatch de especies modded crea un `Pet` con un snapshot del `Mod.data` (inmutable).
- El minigame custom es 100% client-side (Web Worker); el backend solo valida al publicar.
