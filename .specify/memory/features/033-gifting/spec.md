# Feature Specification: Gifting & Care Packages

**Feature Branch**: `[033-gifting]`
**Created**: 2025-02-02
**Status**: Implemented
**Input**: Sistema de regalos entre jugadores: enviar items del inventario al pet de un amigo (máx 3/día), "Care Packages" para pets enfermos (bundle comida+medicina+toy+coins+nota), y "Group Feeding" donde 3-5 jugadores cocinan juntos un item raro en una room de 10 min.

## User Scenarios & Testing

### User Story 1 - Gifting básico (Priority: P1)

Como jugador, quiero enviar un item de mi inventario al pet de un amigo para "que le caiga bien" a su pet.

**Why this priority**: La conexión social central del feature.

**Independent Test**: `POST /v1/gifting/send` con recipient y item; verificar que el item se traslada del inventario del sender a un `Gift` pendiente y que aparece en `GET /v1/gifting/history?direction=sent`.

**Acceptance Scenarios**:
1. **Given** sender con 3 del item, **When** envía 1, **Then** inventario del sender queda en 2 y se crea `Gift` pendiente.
2. **Given** 3 gifts enviados hoy, **When** intenta un 4º, **Then** se rechaza por rate limit.
3. **Given** 5 recibidos hoy, **When** recibe otro, **Then** se rechaza.

---

### User Story 2 - Aceptar / rechazar (Priority: P2)

Como receptor, quiero aceptar (el item va a mi inventario) o rechazar (vuelve al sender) un gift en 24h.

**Why this priority**: Cierre del ciclo del regalo y economía (transferencia, no duplicación).

**Independent Test**: Aceptar un gift → item en inventario del receptor; rechazar → item vuelve al sender.

**Acceptance Scenarios**:
1. **Given** gift pendiente, **When** se acepta, **Then** item en inventario del receptor y estado `accepted`.
2. **Given** gift pendiente, **When** se rechaza, **Then** item vuelve al sender y estado `rejected`.
3. **Given** gift >24h sin acción, **When** se consulta, **Then** estado `expired` (auto-acepta opcional).

---

### User Story 3 - Care Package para pet enfermo (Priority: P2)

Como jugador, quiero enviar un Care Package (comida+medicina+toy+50 coins+nota) al pet enfermo de un amigo ausente.

**Why this priority**: "Magneto de retorno" — el amigo vuelve porque alguien le envió algo.

**Independent Test**: `POST /v1/care-packages/send` a un pet `sick=true`; verificar que se aplica (+20 health, +50 coins al receptor) y se crea `CarePackage`.

**Acceptance Scenarios**:
1. **Given** pet receptor `sick=true`, **When** envía care package, **Then** se aplica heal y se descuenta del sender.
2. **Given** pet NO enfermo, **When** envía care, **Then** se rechaza (AC: care solo si sick).
3. **Given** 1 care enviado a ese receptor hoy, **When** envía otro, **Then** se rechaza (máx 1/día por receptor).

---

### User Story 4 - Group Feeding (Priority: P3)

Como jugador, quiero cocinar con 3-5 amigos un item raro (room de 10 min) y repartir recompensas proporcionalmente.

**Why this priority**: Sesión social / hangout.

**Independent Test**: `POST /v1/group-feeding/join` crea o se une a una room; completar minijuegos → item raro repartido (30% host, resto al 23.3%).

**Acceptance Scenarios**:
1. **Given** room nueva, **When** el host se une, **Then** position 1 y minijuego asignado.
2. **Given** 3 jugadores completando, **When** todos completan, **Then** se genera item raro y se reparte proporcionalmente.
3. **Given** room expirada (10min), **When** se intenta unirse, **Then** se rechaza / 50% reward si incomplete.

---

### Edge Cases

- Item duplication: gift = transferencia (NO duplicar).
- No se regalan gems (solo inventory).
- Room abandonada → expira 10min; 50% reward si incompleta.
- Multi-device: WS broadcast al room.
- Re-gift: item recibido va a inventory y puede regalarse.

## Requirements

### Functional Requirements

- **FR-001**: System MUST exponer `POST /v1/gifting/send` para enviar un item a un pet.
- **FR-002**: System MUST exponer `GET /v1/gifting/history` (direction=sent|received, máx 50).
- **FR-003**: System MUST exponer `POST /v1/care-packages/send` para enviar un care package.
- **FR-004**: System MUST exponer `POST /v1/group-feeding/join` para crear/unirse a una room.
- **FR-005**: System MUST aplicar rate limits: 3 gifts/día enviados, 5 recibidos, 1 care/día por receptor, 1 group feeding/día.
- **FR-006**: System MUST transferir el item (sin duplicar) y soportar aceptar/rechazar (24h).
- **FR-007**: System MUST persistir `Gift`, `CarePackage`, `GroupSession` en Prisma.
- **FR-008**: System MUST emitir WS `gift:sent`/`gift:received`/`care:package-received`/`group:feeding-*`.
- **FR-009**: System MUST repartir group feeding proporcionalmente (30% host, 23.3% resto).

### Key Entities

- **Gift** (nuevo): senderId, receiverId, petId, itemId, qty, note, thankYouNote, status, sentAt, expiresAt
- **CarePackage** (nuevo): senderId, receiverId, petId, foodItemId, medicineItemId, toyItemId, coins, note
- **GroupSession** (nuevo): code, hostId, maxPlayers, status, participants, generatedItemId, rewardsDistributed

## Success Criteria

### Measurable Outcomes

- **SC-001**: Rate limits cumplen el 100% de bloqueos (3/5/1/1 por día).
- **SC-002**: Transferencia de items sin duplicación (conservación de unidades).
- **SC-003**: Care package aplica heal + coins correctamente.
- **SC-004**: Group feeding reparte proporcionalmente (30/23.3%).

## Assumptions

- `Item.kind` distingue food/medicine/toy para care package.
- Rate limits vía conteo en Prisma (fiabilidad sobre Redis; Redis opcional).
- `RealtimeGateway` para eventos WS y room broadcast.
- v1: item del care package se aplica directamente (no requiere aceptación).
