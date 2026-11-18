# Esquema de `shared/game-data/habitats.json`

El validador es `habitatsSchema` en `backend/src/modules/game-data/game-data.schemas.ts`. Usa zod sin `.strict()`, así que **descarta en silencio las claves desconocidas**.

## Salas (`rooms[]`)
| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | único |
| `name` | string | en español |
| `gridWidth`, `gridHeight` | int | hoy 14×10 en todas |
| `blocked` | `[[x, y, ancho, fondo], …]` | celdas sin suelo que dan forma a la sala (estanque, escalón, abismo). No pueden tocar `x = 0` ni `y = 0` (paredes), el suelo debe quedar conexo y caber el mueble de suelo más grande. Un mueble de suelo encima → `out_of_bounds`. El jardín deja libre 0–3 × 0–3 (refugio bajo el árbol) |
| `unlockStage` | `baby \| juvenile \| adult \| final` | la sala se desbloquea con la etapa del Pockai |
| `description` | string | |
| `theme` | objeto | `{ wall, wallShade, floor, floorAlt, trim, sky, light }` en hex (opcional; los clientes tienen uno por defecto) |

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
| `footprint` | `[w, d]` | celdas en x e y con rotación 0; al girar 90° se intercambian |
| `mount` | `floor \| wall` | los de pared van en la fila `y = 0` (pared del fondo-derecha) o la columna `x = 0` (pared del fondo-izquierda) |
| `interaction` | `sleep \| eat \| play \| bathe \| sit` | opcional; el Pockai lo usa según sus necesidades |

**Claves de buff:** `hygiene_decay_reduction`, `happiness_decay_reduction`, `energy_recovery_boost` y `combat_mood_bonus`. Los topes están en `buffCaps` con el sufijo `_max`. El cálculo está en `HabitatService.getActiveBuffs`: suma y recorta al tope.

## Colocación (backend)
- `HabitatItem { roomId, x, y, rotation }`: `(x, y)` es la celda ancla, el vértice superior de la huella en pantalla; `rotation` va de 0 a 3.
- La geometría está en `backend/src/modules/habitat/habitat-layout.ts`. Los muebles de suelo chocan entre sí. Los de pared no ocupan suelo; van en `y = 0` con rotación par o en `x = 0` con impar.
- API:
  - `POST /habitat/furniture/:id/place` acepta `{ x, y, rotation }`; sin cuerpo, usa el primer hueco donde quepa.
  - `PATCH /habitat/items/:itemId` mueve o gira sin coste.
  - `DELETE /habitat/items/:itemId` quita un mueble concreto.
- Si cambias la huella de un mueble ya vendido, `getHabitat` recoloca una vez los que dejen de ser válidos.

## Huellas habituales
| Tipo | Huella | Montaje |
|---|---|---|
| Juguete, maceta, lámpara pequeña | 1×1 | suelo |
| Cama, banco, sofá | 2×1 | suelo |
| Estanque, alfombra, fuente grande | 2×2 | suelo |
| Altar, trono | 2×2 | suelo |
| Estantería, cuadro, ventana | 1×1 o 2×1 | pared |
