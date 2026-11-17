# Esquema de `shared/game-data/habitats.json`

El validador es `habitatsSchema` en `backend/src/modules/game-data/game-data.schemas.ts`. Usa zod sin `.strict()`, así que **descarta en silencio las claves desconocidas**.

## Salas (`rooms[]`)
| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | único |
| `name` | string | en español |
| `gridWidth`, `gridHeight` | int | hoy 14×10 en todas |
| `unlockStage` | `baby \| juvenile \| adult \| final` | la sala se desbloquea con la etapa del Pockai |
| `description` | string | |
| `theme` *(migración)* | objeto | `{ wall, wallShade, floor, floorAlt, trim, sky, light }` en hex; hoy viven en el CSS de `desktop/src/components/HabitatTab.svelte` |

## Muebles (`furniture[]`)
| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | único, en snake_case |
| `name` | string | en español |
| `room` | string | id de una sala existente |
| `price` | int ≥ 0 | |
| `currency` | `coins \| gems` | |
| `buffs` | `{ clave: número }` | claves válidas abajo; `{}` si es decorativo |
| `description` | string | 1 frase; cita el buff |
| `footprint` *(migración)* | `[w, d]` | celdas en x e y con rotación 0; al girar 90° se intercambian |
| `mount` *(migración)* | `floor \| wall` | los de pared van en la fila `y = 0` (pared izquierda) o la columna `x = 0` (pared derecha) |
| `interaction` *(migración)* | `sleep \| eat \| play \| bathe \| sit` | opcional; el Pockai lo usa según sus necesidades |

**Claves de buff:** `hygiene_decay_reduction`, `happiness_decay_reduction`, `energy_recovery_boost` y `combat_mood_bonus`. Los topes están en `buffCaps` con el sufijo `_max`. El cálculo está en `HabitatService.getActiveBuffs`: suma y recorta al tope.

## Colocación (backend)
- `HabitatItem { roomId, x, y, rotation* }`: `(x, y)` es la celda ancla, el vértice superior de la huella en pantalla.
- Hoy el servidor coloca cada mueble en la primera celda libre y existe `@@unique([petId, x, y, roomId])`.
- Con la migración, se valida la huella completa y se añade `PATCH /habitat/items/:id` para mover y girar.

## Huellas habituales
| Tipo | Huella | Montaje |
|---|---|---|
| Juguete, maceta, lámpara pequeña | 1×1 | suelo |
| Cama, banco, sofá | 2×1 | suelo |
| Estanque, alfombra, fuente grande | 2×2 | suelo |
| Altar, trono | 2×2 | suelo |
| Estantería, cuadro, ventana | 1×1 o 2×1 | pared |
