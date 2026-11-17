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
| `hygiene_decay_reduction` | 0,40 | 0,10–0,20 |
| `happiness_decay_reduction` | 0,30 | 0,10–0,20 |
| `energy_recovery_boost` | 0,40 | 0,15–0,20 |
| `combat_mood_bonus` | 0,10 | 0,05–0,10, solo con gemas |

Reglas:
- Un mueble lleva como mucho 2 buffs, y su suma no pasa de 0,35.
- `getActiveBuffs` suma **todas las salas**. Tras añadir el mueble, si la suma del catálogo para un buff supera el tope por más del doble, el mueble no aporta: dale otro buff o déjalo decorativo.
- `check_habitats.mjs` muestra esas sumas.
