# Pesca de Códices (`reflex`)

- **Familia:** Juego del Santuario
- **Lugar:** la orilla del Telar de Mulberry
- **Lore:** Los Códices Latentes afloran un instante en las corrientes del Telar; hay que pescarlos antes de que se hundan, sin picar en los que están a medio tejer.
- **Verbo:** tirar del sedal a tiempo

## Reglas
- Aflora algo cada 1,0–1,4 s y dura 0,9 s. Pescar un Códice en menos de 0,4 s da 2 puntos; después, 1.
- **Señuelos:** una de cada cinco veces aflora un Códice sin tejer. Tirar de él no da nada y enreda el sedal 1 s, durante el que no se puede pescar. Dejarlo pasar no cuenta como fallo.
- Nada aflora en la franja de la orilla.

**Techo.** Como mucho un Códice por segundo × 2 = 2 pt/s; los señuelos solo lo bajan.

## Variante accesible
El Códice espera hasta que se pesca, vale siempre 1 y no hay señuelos.

## El Pockai
Pesca desde la orilla, abajo a la izquierda, y mira hacia donde aflora cada Códice. Tira (`attack`) al pescar, se alegra (`happy`) si fue rápido y se encoge (`hit`) y parpadea mientras el sedal está enredado.

## Fondo
La orilla del Telar: arriba, los hilos tensos del telar entre dos postes; en medio, agua oscura y lisa en añil verdoso; abajo, una franja de piedra con musgo, más ancha a la izquierda.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `codex.png` | Códice Latente: un huevo de datos con dos bandas tejidas y una runa | 48 | Neutra del Nexo, bandas en Agua, runa `#fff1c2` | Huevo liso |
| `lure.png` | Códice sin tejer: roto, con hilos sueltos | 48 | Ruido (`#1a1426` `#3d3654` `#6b6485` `#a8a2bd`, acento `#7cf5e6`) | Huevo mellado y con hebras que salen |
| `ripple.png` | Onda en el agua, bajo lo que aflora | 32 | Agua de `FLOW_PALETTES` | Anillo ovalado con gotas |

## Reutilizado
- El Códice se usa también como recuerdo en Cristal de Recuerdos.

## Notas
- Espacio, Enter, clic y toque valen lo mismo: la lógica solo sabe de «tirar». Con teclado, el señuelo se evita no pulsando.
- El señuelo se distingue por silueta, color y temblor, no solo por color.
