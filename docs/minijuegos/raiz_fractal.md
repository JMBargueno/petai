# Raíz Fractal (`raiz_fractal`)

- **Familia:** Prueba de Planta
- **Lugar:** el suelo de la Bio-Red
- **Lore:** Una semilla de la Bio-Red solo brota si la savia encuentra camino; hay que girar las raíces con paciencia hasta que llegue.
- **Verbo:** girar raíces

## Reglas
Sin cambios (`spec-39` §5): se giran las raíces para llevar la savia de la semilla al borde derecho; tableros de 4×4, 5×5 y 6×6; 5 puntos por tablero. Techo 4 pt/s.

## Variante accesible
Se resalta la siguiente raíz mal girada.

## El Pockai
Espera en la repisa de la derecha, donde sale la savia, y se alegra (`happy`) cada vez que un tablero florece.

## Fondo
Un corte de tierra oscura con raíces viejas colgando de arriba, piedras enterradas a la derecha y una repisa abajo a la derecha.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `seed.png` | La semilla de la que sale la savia | 32 | Planta | Lágrima con un brote de dos hojas |
| `bloom.png` | La flor que brota donde la savia sale | 32 | Planta clara, centro `#ffd166` | Flor de cinco pétalos |

## Reutilizado
- Las raíces siguen siendo SVG (hay que girarlas en cuatro orientaciones), con tramos rectos y nudo cuadrado para que casen con el pixel art.

## Notas
- La semilla va delante de su fila, fuera del tablero; la flor, en el borde derecho de la fila por la que sale la savia.
