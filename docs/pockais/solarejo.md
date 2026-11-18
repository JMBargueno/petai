# Solarejo — «El conejo del amanecer»

> Un conejo risueño con las puntas de las orejas encendidas como un amanecer. Se acerca a todo el mundo y contagia su buen humor.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| light (Flujo de la Luz) | rare (Espíritu Condensado) | Equilibrado | Miel de Alba (`dawn_honey`) |

## Clasificación y hábitat
- **Tipo:** bestia pequeña.
- **Tamaño aparente:** pequeño.
- **Hábitat en el Éter:** álbumes de fotos, sobre todo los de primera hora de la mañana.
- **Comportamiento social:** en grupo; es el primero en saludar.

## Anatomía y rasgos distintivos
Pelaje crema y orejas largas que usa como antenas de luz: las puntas se encienden cuando está contento. Se mueve a saltos cortos y la cola, un pompón, queda brillando un instante después de cada salto.
- **Rasgos icónicos (silueta):** 1) las orejas largas de punta encendida; 2) la cola de pompón luminoso.

## Ecología y lore
Alguien fotografió el mismo amanecer mil veces, desde la misma ventana, porque le recordaba a casa. Esa constancia condensó la primera luz del día en un conejo que no sabe estar triste mucho rato. Es un Espíritu Condensado: nació de una costumbre querida. Los Custodios dicen que, si tu Solarejo se sienta mirando al este, es que mañana hará buen día.

## Comportamiento en combate
- **Arquetipo:** equilibrado — todos los stats cerca de la media, con un punto más de `vel` (56).
- **Skills recomendadas (4):** `glimmer` (quema desde el nivel 1), `radiant_beam` (su golpe elemental), `swift_strike` (aprovecha su velocidad), `recover` (lo hace fiable en combates largos).
- **Ventajas / debilidades:** fuerte contra sombra y débil frente a sombra (luz y sombra se dañan mutuamente).

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 55 (attentive) | 80 (outgoing) | 50 (steady) | 75 (affectionate) | 55 (lively) |

Es sociable y cariñoso por encima de todo: el contrapunto luminoso del Inktopus.

**Cómo puede evolucionar:** con aventuras y combates gana valentía y se vuelve un compañero decidido; con una crianza casera se hace aún más devoto y tranquilo.
**Vida autónoma típica:** busca a otros Pockai, recibe a las visitas y espera a su Custodio junto a la ventana.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Una bolita que aún no salta | Una bola aplastada, sin brazos ni cola | Dos orejas cortas | Sin barriga, mofletes, ojos enormes |
| **Juvenile (10)** | Primeros saltos | Cuerpo alargado con brazos | Orejas largas y cola de pompón | Barriga |
| **Adult (25)** | Salta de sol a sol | Cabeza y torso separados | Orejas completas y pompón grande | Manchas en el lomo |
| **Final (50, Piedra de Evolución)** | Lleva el amanecer consigo | Liebre robusta de ancas grandes | Orejas muy largas, doble pompón, pechera de pelusa y esquirlas de luz flotando, que leen el elemento | Rayas atigradas por todo el cuerpo, anillo en el vientre, ceja |

**No cambia:** el pelaje crema, la forma del ojo, las orejas saliendo de lo alto de la cabeza y el pompón.

**Anclas de accesorios:** `head` entre las dos orejas, que asoman a los lados de cualquier gorro; `back` junto al pompón.

## Frases de chat de ejemplo
1. «¡Buenos días! Bueno, o tardes. ¡Buenos lo que sea!»
2. «¿Viene alguien hoy? Dime que viene alguien.»
3. «¿Un día malo? Ven aquí. Mañana amanece otra vez, te lo prometo.»

## Brief de arte
Pixel art en 3/4. Cuerpo en primario; interior y punta de las orejas, barriga, pompón y rayos en secundario; manchas y franjas en primario oscurecido. Las orejas laten con los apéndices y el pompón gira con la cola.

**Estado del arte:** redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Tiene proporción de conejo (ancas, pecho estrecho). Las rayas atigradas van en el acento, que pasa a pizarra; la etapa final suma pechera de pelusa, anillo en el vientre y esquirlas de luz alrededor de la cabeza.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "solarejo",
  "name": "Solarejo",
  "description": "Un conejo risueño con las puntas de las orejas encendidas como un amanecer. Se acerca a todo el mundo y contagia su buen humor.",
  "element": "light",
  "rarity": "rare",
  "baseStats": { "hp": 54, "atk": 51, "def": 52, "vel": 56, "esp": 52 },
  "favoriteFood": "dawn_honey",
  "spriteKey": "solarejo",
  "personalityBias": { "curiosity": 55, "sociability": 80, "bravery": 50, "affection": 75, "temper": 55 },
  "defaultPalette": { "primary": "#F4F1DE", "secondary": "#E07A5F", "accent": "#7A7689" }
}
```
