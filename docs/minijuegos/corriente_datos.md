# Corriente de Datos (`corriente_datos`)

- **Familia:** Prueba de Agua
- **Lugar:** un torrente del Flujo de Datos
- **Lore:** Tu Pockai nada corriente arriba recogiendo paquetes sanos y dejando pasar los bloques corruptos.
- **Verbo:** cambiar de carril

## Reglas
Sin cambios (`spec-39` §5): 4 carriles; paquete +1; un bloque corrupto frena 1 s; más rápido cada 15 s. Techo 2 pt/s.

## Variante accesible
Corriente a la mitad de velocidad y los bloques no frenan.

## El Pockai
Es el nadador: ocupa el carril, mira hacia donde cambia, y se encoge (`hit`) y parpadea cuando choca con un bloque.

## Fondo
Un río de datos visto desde arriba, en azul marino con vetas verticales, entre dos orillas de roca.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `packet.png` | Paquete de datos | 32 | Agua de `FLOW_PALETTES` | Cubo redondeado con una banda |
| `block.png` | Bloque corrupto, a medio compilar | 32 | Ruido (`#1a1426` `#3d3654` `#6b6485` `#a8a2bd`, acento `#7cf5e6`) | Cubo mellado |

## Reutilizado
- Las separaciones de carril son una línea en CSS.

## Notas
- El bloque tiembla; con movimiento reducido, no.
