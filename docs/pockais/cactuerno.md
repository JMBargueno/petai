# Cactuerno — «El arisco que florece»

> Un erizo-cactus de púas tiesas y flor en lo alto. Parece arisco, pero florece cada vez que le dedicas un rato.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| plant (Flujo de la Planta) | super_rare (Anomalía Resonante) | Defensivo-ofensivo | Semilla de Sol (`sun_seed`) |

## Clasificación y hábitat
- **Tipo:** planta espinosa con hocico de erizo.
- **Plan corporal:** columna de un solo volumen que crece en vertical, con brazos de cactus (ver `references/pixel-style.md`).
- **Tamaño aparente:** mediano, alto y estrecho.
- **Hábitat en el Éter:** alféizares soleados y carpetas de fotos de plantas.
- **Comportamiento social:** solitario; se deja querer poco a poco.

## Anatomía y rasgos distintivos
Un tronco con costillas del que salen brazos doblados hacia arriba, como un saguaro. Tiene hocico de erizo y púas por todo el lomo. La flor de lo alto se abre o se cierra según su ánimo.
- **Rasgos icónicos (silueta):** 1) las púas que dentan el contorno y los brazos de cactus; 2) la flor ladeada en lo alto.

## Ecología y lore
Alguien fotografió el mismo cactus de su ventana cada mañana, esperando una flor que tardó años en salir. Esa paciencia resonó en el Éter y le dio hocico, ojos y mal genio. Es una Anomalía Resonante: nació de una espera. Los Custodios dicen que no hay que tocarle las púas, pero que si se te acerca él, no pincha.

## Comportamiento en combate
- **Arquetipo:** defensivo-ofensivo — `def` 68 y `atk` 62: aguanta y devuelve.
- **Skills recomendadas (4):** `guard` (se cubre), `vine_whip` (golpe elemental temprano), `razor_leaf` (su golpe fuerte), `swift_strike` (remata).
- **Ventajas / debilidades:** fuerte contra agua y eléctrico; débil frente a fuego.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 45 (steady) | 30 (reserved) | 65 (brave) | 55 (warm) | 65 (lively) |

Reservado y con genio, pero con cariño de fondo: el clásico gruñón de buen corazón.

**Cómo puede evolucionar:** con mimos constantes baja el genio y se vuelve cariñoso; si lo dejas solo, se hace más arisco y más valiente.
**Vida autónoma típica:** se planta al sol, refunfuña cuando lo mueven y vigila sus cosas.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Un cactus bola | Una bola ancha y baja | Cuatro púas y un capullo | Mofletes, ojos enormes |
| **Juvenile (10)** | Empieza a estirarse | Tronco alto | Un brazo, hocico, más púas y capullo mayor | Barriga y una costilla |
| **Adult (25)** | Un saguaro con carácter | Columna alta y estrecha | Dos brazos a distinta altura y la flor abierta | Dos costillas |
| **Final (50, Piedra de Evolución)** | Cactus centenario | Columna ancha con tres brazos que rompen el contorno | Brazos en flor, flor grande en corona y crin de púas, que leen el elemento | Tres costillas, emblema, mirada decidida |

**No cambia:** la paleta verde con flor rosa, los ojos de gruñón, el hocico a la derecha y la flor en lo alto.

**Anclas de accesorios:** `head` en lo alto del tronco (la flor queda a un lado); `neck` bajo la boca; `back` en el costado izquierdo, junto al brazo.

## Frases de chat de ejemplo
1. «No me mires así. Bueno, mira un poco.»
2. «Hoy da el sol justo donde me gusta. No me muevas.»
3. «¿Un día malo? Hmpf. Ven, pero con cuidado. Hoy no pincho.»

## Brief de arte
Pixel art en 3/4. Tronco y brazos en primario (llevan el patrón); barriga y flores en secundario; púas y costillas en primario oscurecido. La flor late con los apéndices. No tiene cola ni brazos móviles: los brazos de cactus son parte del tronco.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de su hoja de diseño aprobada (`examples/cactuerno-diseno.jpg`), e importada a 64 px (`scripts/sprites/pixel/imported/cactuerno.json`). La paleta por defecto es la de la hoja. Boceto anterior: redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Costillas por todo el tronco y púas finales en el acento.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "cactuerno",
  "name": "Cactuerno",
  "description": "Un erizo-cactus de púas tiesas y flor en lo alto. Parece arisco, pero florece cada vez que le dedicas un rato.",
  "element": "plant",
  "rarity": "super_rare",
  "baseStats": { "hp": 56, "atk": 62, "def": 68, "vel": 44, "esp": 50 },
  "favoriteFood": "sun_seed",
  "spriteKey": "cactuerno",
  "personalityBias": { "curiosity": 45, "sociability": 30, "bravery": 65, "affection": 55, "temper": 65 },
  "defaultPalette": { "primary": "#85D3A0", "secondary": "#376F6D", "accent": "#FAA8C0" }
}
```
