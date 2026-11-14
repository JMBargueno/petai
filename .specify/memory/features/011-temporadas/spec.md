# Spec: Temporadas + Pase de Temporada (Feature 011)

## ID
11 — Temporadas + Pase de Temporada

## Resumen
Sistema de temporadas con pase premium que otorga recompensas progresivas. Cada temporada dura un período fijo, tiene un tema y un set de recompensas por tier. El pase de temporada desbloquea recompensas adicionales por nivel.

## User Stories
1. Como jugador, quiero ver la temporada actual con su tema, tiers y recompensas.
2. Como jugador, quiero comprar el pase de temporada para desbloquear recompensas premium.
3. Como jugador, quiero ver mi progreso en la temporada (tier actual, recompensas desbloqueadas).
4. Como jugador, quiero reclamar recompensas al alcanzar cada tier.
5. Como jugador, quiero ver las recompensas que aún no he desbloqueado.
6. Como jugador, quiero ver la próxima temporada con antelación.

## Functional Requirements
- FR-01: El endpoint GET /v1/seasons/current retorna la temporada activa con tiers, tema y tiempo restante.
- FR-02: El endpoint GET /v1/seasons/:id retorna detalles de una temporada específica.
- FR-03: POST /v1/seasons/pass/purchase compra el pase de temporada por gemas.
- FR-04: GET /v1/seasons/progress retorna el progreso del usuario en la temporada actual.
- FR-05: Las recompensas se desbloquean automáticamente al alcanzar el tier.
- FR-06: El pase es opcional y desbloquea un set de recompensas adicionales.
- FR-07: Al expirar la temporada, el progreso se archiva y se inicia la siguiente.
- FR-08: Solo se puede comprar un pase por temporada por usuario.
- FR-09: El progreso (xp/temp XP) se acumula con actividades del juego.

## Acceptance Criteria
- AC1: GET /v1/seasons/current retorna season data con tiers, rewards, endTime.
- AC2: POST /v1/seasons/pass/purchase descuenta gemas y marca el pase como comprado.
- AC3: GET /v1/seasons/progress retorna currentTier, earned rewards, next reward.
- AC4: Un usuario ya con pase no puede re-comprar (409 Conflict).
- AC5: Al alcanzar un tier, las recompensas del tier se acreditan automáticamente.

## Non-Functional
- Temporada dura ~30 días configurables.
- 50 tiers por temporada.
- Recompensas: coins, gems, items, skins.
- Pase cuesta 300 gemas.
- Data-driven: seasons.json define tiers y recompensas.

## Dependencies
- UsersModule (gems balance)
- game-data module (serve seasons.json)
- InventoryModule (grant items as rewards)
- EventsModule (season events)
