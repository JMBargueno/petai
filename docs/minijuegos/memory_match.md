# Cristal de Recuerdos (`memory_match`)

- **Familia:** Juego del Santuario
- **Lugar:** el interior del Cristal de Recuerdos
- **Lore:** El Cristal guarda lo que habéis vivido en facetas desordenadas; emparejarlas las fija para que no se borren.
- **Verbo:** emparejar

## Reglas
- 16 facetas, 8 parejas de recuerdos.
- **Destello:** al empezar, el Cristal enseña todas las facetas 2 s y luego las apaga. Mientras dura no se puede tocar nada.
- 2 puntos por pareja, más un bonus de rapidez de hasta 8 (solo si se completa), menos 1 por cada 3 fallos.
- La partida acaba al completar el tablero.

**Techo.** El máximo es 24 y no depende del tiempo: cabe en 3 pt/s × 8 s de duración mínima aunque el destello permita acabar antes.

## Variante accesible
8 facetas (4 parejas), destello de 3 s y la pareja de la faceta destapada brilla.

## El Pockai
Espera a la derecha del tablero mirando las facetas. Se sorprende con el destello (`surprised`), se alegra con cada pareja (`happy`), se encoge con cada fallo (`hit`) y celebra al completarlo (`celebrate`).

## Fondo
El interior de una gema hueca: paredes facetadas en violeta profundo a los lados, que se cierran arriba como una bóveda, y un suelo liso de cristal. Dos tercios de la izquierda lisos, para el tablero.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `facet_back.png` | Faceta apagada | 48 | Sombra de `FLOW_PALETTES` (`#120a26` `#3a2a8c` `#5c4ade` `#a99cff`) | Cuadrado de esquinas cortadas con un rombo en el centro |
| `facet_front.png` | Faceta encendida: el marco sobre el que va el recuerdo | 48 | `#3a2a8c` `#a99cff` `#ece8ff` | La misma, con la cara lisa y clara |

## Reutilizado
- Los recuerdos son los frutos de los Seis Flujos y el nudo del Telar (`evolution_stone`), de `shared/assets/items/`, y el Códice de Pesca de Códices (`reflex/codex.png`).

## Notas
- Las facetas son botones de verdad: Tab y Enter.
- El recuerdo va centrado sobre la faceta encendida, a su tamaño (32 sobre 48).
