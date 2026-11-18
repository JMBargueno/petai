# Balance de muebles

Lee siempre los valores actuales de `habitats.json`. Lo que sigue es la convención derivada del catálogo existente.

## Precios
| Tipo | Precio | Moneda |
|---|---|---|
| Decorativo puro (sin buffs) | 100–200 | coins |
| Un buff pequeño (≤ 0,10) | 300–450 | coins |
| Un buff medio (0,15–0,20) | 500–800 | coins |
| Dos buffs | 700–900 | coins |
| Pieza "de prestigio" de sala avanzada (altar, trono) | 1–2 | gems |

- Sube el precio un 10–20 % en las salas de etapas más altas (santuario y cita final).
- Una interacción (`sleep`, `eat`…) sin buff añade unas 100 coins frente al decorativo puro.

## Buffs y topes
| Buff | Tope (`buffCaps`) | Por mueble |
|---|---|---|
| `hygiene_decay_reduction` | 0,40 | 0,05–0,15 |
| `happiness_decay_reduction` | 0,30 | 0,05–0,10 |
| `energy_recovery_boost` | 0,40 | 0,10–0,20 |
| `combat_mood_bonus` | 0,10 | 0,03–0,06, solo con gemas |

Reglas:
- Un mueble lleva como mucho 2 buffs, y su suma no pasa de 0,35.
- **El catálogo completo (un mueble de cada tipo) suma exactamente cada tope.** `getActiveBuffs` suma todas las salas y recorta al tope, así que, si el catálogo pasara del tope, habría muebles que se pagan y no aportan. Por tanto, al añadir un mueble con buff hay que **repartir** ese buff: bajar los de los demás muebles para que la suma siga siendo el tope, o subir el tope a propósito y decirlo.
- Las salas más avanzadas aportan más que las primeras. Ningún mueble llega por sí solo al tope.
- Los duplicados (dos fuentes) suman, pero el tope los recorta: no se cuentan en la regla del catálogo.
- **Repartir rebaja muebles que los jugadores ya tienen (es un nerf).** Dilo siempre en la propuesta, con cada mueble y su valor antes y después, y ofrece la alternativa de subir el tope para que el usuario elija. Actualiza también la `description` de los muebles rebajados y las expectativas del e2e (`backend/test/habitat.e2e-spec.ts`) que citen sus valores.
- `check_habitats.mjs` falla si una suma supera el tope y avisa si no llega.

El reparto actual lo imprime `check_habitats.mjs` (una línea por buff con cada mueble y su valor). No se copia aquí para que no se desfase: si repartes un buff, basta con que la salida del script vuelva a cuadrar.
