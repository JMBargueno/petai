# Pulso Voltaico (`pulso_voltaico`)

- **Familia:** Prueba de Eléctrico
- **Lugar:** una sinapsis de la Red
- **Lore:** Los pulsos cruzan la sinapsis y tu Pockai los acompaña: quien vive en el milisegundo no llega ni antes ni después.
- **Verbo:** pulsar al ritmo

## Reglas
Sin cambios (`spec-39` §5): ritmo en 3 hilos; perfecto (±4 ticks) 2 puntos, bien (±9) 1; tempo de 90 a 130 BPM según la semilla. Techo 3 pt/s.

## Variante accesible
Caída 1,5 veces más lenta y ventanas de acierto ×3.

## El Pockai
Lleva el ritmo desde la repisa de la derecha: se alegra con cada perfecto (`happy`), acompaña cada acierto (`attack`) y se encoge con cada fallo (`hit`).

## Fondo
El hueco oscuro entre dos troncos de cable trenzado, con una hebra de luz arriba y una repisa de piedra abajo. Los tres cuartos de la izquierda, lisos.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `pulse.png` | El pulso que baja por el hilo | 32 | Eléctrico de `FLOW_PALETTES` | Rayo corto y grueso |
| `node.png` | El nodo de la sinapsis, donde hay que pulsar | 32 | Eléctrico | Anillo grueso |

## Reutilizado
- Los hilos son una línea en CSS.

## Notas
- Los hilos ocupan el 74 % del ancho; el resto es del Pockai.
