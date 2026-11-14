# Spec: Cruzamiento / Breeding (Feature 012)

## ID
12 — Cruzamiento (Breeding)

## Resumen
Sistema de cría de pets donde el jugador combina dos pets para producir un descendiente. El genético engine usa herencia del 50% de genes de cada padre y 10% de probabilidad de mutación. El resultado se calcula con crypto.randomInt para ser determinista con seed.

## User Stories
1. Como jugador, quiero cruzar dos de mis pets para obtener un descendiente.
2. Como jugador, quiero ver el estado de una cría en progreso (tiempo restante).
3. Como jugador, quiero ver el historial de mis crías pasadas.
4. Como jugador, quiero saber qué genes heredará el descendiente antes de confirmar.
5. Como jugador, quiero que los genes del descendiente sean predecibles con una seed.

## Functional Requirements
- FR-01: POST /v1/breeding/start inicia una cría entre dos pets del mismo usuario.
- FR-02: El genético engine hereda 50% de genes de cada padre.
- FR-03: 10% de probabilidad de mutación por gen usando crypto.randomInt.
- FR-04: GET /v1/breeding/:id retorna el estado de una cría (en progreso o completada).
- FR-05: GET /v1/breeding/history retorna el historial de crías del usuario.
- FR-06: La cría tarda un tiempo fijo (configurable) antes de completar.
- FR-07: El descendiente se genera automáticamente al completar la cría.
- FR-08: Ambos padres deben pertenecer al mismo usuario.
- FR-09: No se pueden cruzar dos pets de la misma especie (opcional, configurable).
- FR-10: El resultado es determinista dado un seed (visualSeed del descendiente).

## Acceptance Criteria
- AC1: POST /v1/breeding/start valida ambos parents y crea el Breeding record.
- AC2: GET /v1/breeding/:id retorna status: "in_progress" | "completed" con resultado si completo.
- AC3: GET /v1/breeding/history retorna lista de crías anteriores.
- AC4: Un usuario no puede acceder a crías de otro usuario (403/404).
- AC5: El genético engine produce genes válidos (50/50 herencia + 10% mutación).

## Non-Functional
- Tiempo de cría: 2 horas (configurable en balance).
- Max 3 crías simultáneas por usuario.
- Cooldown: 1 hora entre crías del mismo pet.
- crypto.randomInt para RNG seguro.
- Genes: element, rarity (roll), pattern, palette, base stats modifiers.

## Dependencies
- PetsModule (parent pets data)
- Species/Pattern/Pattern models (reference data)
- UsersModule (ownership validation)
- game-data (balance config for breeding)
