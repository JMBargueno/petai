# Spec: Hábitat / Base Personalizable (Feature 010)

## ID
10 — Hábitat / Base Personalizable

## Resumen
Espacio persistente y decorable donde vive la mascota. El jugador coloca muebles que otorgan bonificaciones pasivas a las vitalidades y al combate. Las habitaciones se desbloquean por etapa evolutiva.

## User Stories
1. Como jugador, quiero decorar la habitación de mi pet, para sentir que tiene un hogar con mi estilo.
2. Como jugador, quiero que mi fuente de agua reduzca el decaimiento de higiene, para tener que limpiar menos.
3. Como jugador, quiero desbloquear el Jardín al evolucionar a Joven, para ver que mi progreso tiene recompensa.
4. Como jugador coleccionista, quiero completar el catálogo de muebles, para sentir logro puro sin pelear.
5. Como jugador, quiero ver el efecto de cada mueble antes de comprarlo, para tomar decisiones de gasto.
6. Como jugador, quiero quitar un mueble y que los buffs se actualicen al instante.
7. Como jugador, quiero ver los buffs activos de mi hábitat en un panel dedicado.

## Functional Requirements
- FR-01: El usuario puede ver el estado de su hábitat (salas, muebles colocados, buffs activos).
- FR-02: El usuario puede comprar un mueble con monedas o gemas.
- FR-03: El usuario puede colocar un mueble en una celda libre de una sala desbloqueada.
- FR-04: El usuario puede quitar un mueble de una celda.
- FR-05: Los muebles con buff alteran el cálculo del lazy tick y/o combate.
- FR-06: Solo se colocan muebles en salas cuya etapa evolutiva sea ≤ Pet.stage del pet propietario.
- FR-07: El render de la escena es determinista dado habitatSeed + layout.
- FR-08: Un usuario no puede accionar muebles de otro usuario.
- FR-09: Los buffs pasivos se reflejan en vitals y en el perfil de combate.
- FR-10: El desbloqueo de salas es idempotente y se dispara al evolucionar.

## Acceptance Criteria
- AC1: GET /v1/habitat retorna salas, layout y buffs activos.
- AC2: POST /v1/habitat/furniture/:id/place valida sala+celda y descuenta recursos.
- AC3: DELETE /v1/habitat/furniture/:id quita el mueble y recalcula buffs.
- AC4: GET /v1/habitat/buffs retorna la lista de buffs activos agregados.
- AC5: Un usuario no puede acceder al hábitat de otro usuario (403/404).

## Non-Functional
- Deterministic rendering via habitatSeed.
- Buff caps: higiene mín 1.0/h, felicidad mín 2.0/h, mood combate ≤1.10.
- Grid 14×10 per room.
- Indexed [petId, roomId, x, y] for cell lookups.

## Dependencies
- Module vitalidades/pets (injection of PassiveBuffContext)
- Combat engine (Fighter.mood)
- Evolution flow (room unlocking)
- game-data module (serve habitats.json)
- Economy (User.coins/gems)
