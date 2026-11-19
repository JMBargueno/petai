# Forja Térmica (`forja_termica`)

- **Familia:** Prueba de Fuego
- **Lugar:** el horno del Termo-Impulso
- **Lore:** El Termo-Impulso templa lo que se mantiene en su punto: ni frío, que no forja, ni pasado, que quema.
- **Verbo:** avivar lo justo

## Reglas
Sin cambios (`spec-39` §5): un botón; avivar sube la temperatura y se enfría sola; 3 s en la franja templan un nudo (+4); pasar de 96° lo quema. Techo 1,5 pt/s. Con 40 puntos o más, 50 % de probabilidad de una Baya Ígnea.

## Variante accesible
Franja el doble de ancha y enfriamiento a la mitad.

## El Pockai
Aviva el fuelle: empuja (`attack`) con cada golpe, se alegra (`happy`) al templar un nudo y se encoge (`hit`) si se quema.

## Fondo
Una herrería de piedra: a la derecha, la boca del horno con un resplandor apagado y un yunque; pared oscura y suelo de piedra.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `knot_cold.png` | Nudo del Telar, frío | 48 | Ruido | Nudo de pletina trenzada |
| `knot_hot.png` | El mismo nudo, al rojo | 48 | Fuego | La misma |
| `bellows.png` | Fuelle | 48 | Madera y cuero | Dos palas y una boquilla a la derecha |

## Reutilizado
- El termómetro, la franja y la barra de temple son marcas en CSS.

## Notas
- **Las tres piezas están pendientes de generar** (la API devolvió un 429 por tope de gasto; el prompt está en `sprite-previews/minigames/sheet-e.txt`). Mientras, la vista pinta un recuadro en su sitio.
- El nudo está al rojo solo mientras la forja está en su punto: son dos dibujos, no un filtro.
