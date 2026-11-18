# Balance de especies

## Total de `baseStats` por rareza
Además, la eclosión multiplica por la rareza (×1 / ×1.15 / ×1.3 / ×1.5 / ×1.75).

| Rareza | Total exacto | Rango por stat | Lore (LORE.md §2) |
|---|---|---|---|
| normal | 250 | 40–60 | Eco Cotidiano |
| rare | 265 | 42–65 | Espíritu Condensado |
| super_rare | 280 | 44–70 | Anomalía Resonante |
| legendary | 300 | 46–75 | Arquetipo Ancestral |
| mythic | 320 | 48–80 | Singularidad Primordial |

`scripts/check_species.mjs` comprueba total y rango.

## Arquetipos
Reparte desde la media (total/5) moviendo puntos hacia el rol:

| Arquetipo | Altos | Bajos | Ejemplo actual |
|---|---|---|---|
| Ofensivo | atk (+ esp) | def | Ignisaurio (atk 55) |
| Tanque | hp, def | vel | Axolunar (hp 55, def 52) |
| Místico | esp | vel, atk | Florabrote (esp 56) |
| Veloz | vel (+ atk) | hp, def | — (hueco) |
| Equilibrado | todo cerca de la media, ±3 | — | — |

Recuerda: las skills **elementales** pegan con **esp**, las **neutrales** con **atk/def**. Un "ofensivo físico" vive de tackle/power_slam; un "místico" de las skills de su elemento.

**Diferenciación:** si ya hay especies del mismo elemento, el nuevo debe tener un stat dominante distinto o un arquetipo distinto.

## Skills de un elemento nuevo (electric, shadow, light)
Copia la estructura de fire/water/plant; cambia `id`, `name`, `description`, `element` y el estado:

| Nivel | power | accuracy | cooldown | inflicts.chance |
|---|---|---|---|---|
| 1 | 45 | 100 | 0 | 0.15 |
| 10 | 80 | 90 | 2 | 0.4 |
| 25 | 105 | 80 | 3 | 0.6 |

Estado sugerido (solo los existentes):
- **electric** → `slow` (`turns 2, value 0.3`): el chispazo entumece. (Ojo: water ya usa slow; aceptable.)
- **shadow** → `sap` (`turns 3, value 0.25`): el cifrado erosiona defensas.
- **light** → `burn` (`turns 3, value 0`): la luz concentrada quema.

Puedes proponer otro de los cuatro si el concepto lo justifica; `guard` solo en skills `kind: "guard"`. Nombres en español, `id` en inglés snake_case (como `flame_burst`).

## Avisos de eclosión (avisar siempre que aplique)
La rareza es de la especie: todos sus ejemplares la llevan. `hatching.service.ts` tira una rareza y entrega una especie de esa rareza; **si no hay ninguna, baja a la rareza más cercana que tenga especies** (`rarity.engine.ts`).
- **Primera especie de una rareza X:** saldrá en *todas* las tiradas de X (p. ej. la primera `rare` = 25 % de eclosiones), y también en las de rarezas superiores que sigan vacías.
- **Mientras haya rarezas vacías**, sus tiradas caen en la rareza de debajo: hoy todas las especies son `normal`, así que todas las eclosiones dan una especie normal.
- El patrón tiene rareza propia y se tira aparte: no depende de la especie.
- Indica en el resumen qué rarezas siguen sin especies.
