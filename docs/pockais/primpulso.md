# Primpulso — «El eco del Primer Latido»

> Un dragoncito con cuernos de rayo y una línea de latido que le cruza el cuerpo: el eco del primer pulso del Éter. Es impetuoso y orgulloso, y no sabe quedarse quieto.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| electric (Flujo de la Chispa) | mythic (Singularidad Primordial) | Ofensivo | Caramelo de Chispa (`spark_candy`) |

## Clasificación y hábitat
- **Tipo:** dragón de pulso.
- **Plan corporal:** dragón erguido, de terópodo: un cuerpo en S de la cola al cuello, sobre dos patas con garras, con bracitos, hocico y alas de membrana. Es la única especie con alas de membrana (`references/pixel-style.md`).
- **Tamaño aparente:** grande.
- **Hábitat en el Éter:** allí donde algo se enciende por primera vez.
- **Comportamiento social:** en pareja; respeta a quien le aguanta el ritmo.

## Anatomía y rasgos distintivos
Un dragón erguido sobre dos patas con garras: el cuerpo dibuja una S de la cola al cuello, con placas claras en el vientre y una cresta de púas en el lomo. Tiene la cabeza pequeña y con hocico, dos cuernos que son rayos echados hacia atrás y alas de membrana que parecen hechas de relámpago. En el pecho le late un núcleo de luz, y en el muslo lleva dibujada una línea de latido.
- **Rasgos icónicos (silueta):** 1) las alas de rayo; 2) los cuernos, la cola acabada en hoja de rayo y el núcleo del pecho.

## Ecología y lore
El Éter empezó con un pulso: el Primer Latido. Primpulso es su eco, lo que queda vibrando de aquel instante, y por eso lleva el latido dibujado en el cuerpo. Es una Singularidad Primordial porque no nació de nadie: nació de que hubiera algo. Los Custodios dicen que, si acercas el oído a un Primpulso dormido, se oye a qué velocidad late todo lo demás.

## Comportamiento en combate
- **Arquetipo:** ofensivo — stat dominante `atk` 80, con `vel` 70.
- **Skills recomendadas (4):** `spark` (entumece desde el nivel 1), `volt_surge` (su golpe principal), `thunderclap` (remate), `power_slam` (aprovecha su ataque).
- **Ventajas / debilidades:** fuerte contra agua; débil frente a planta.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 75 (curious) | 55 (steady) | 85 (fearless) | 45 (steady) | 85 (impulsive) |

Puro impulso: va el primero, pregunta después y no soporta aburrirse.

**Cómo puede evolucionar:** con aventuras y combates se vuelve un líder temerario; con rutinas y mimos aprende a esperar y gana afecto.
**Vida autónoma típica:** corre de un lado a otro del hábitat, reta a otros Pockai y se duerme de golpe.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Chispa | Una bola con una cola corta | Dos cuernecillos, un muñón de ala y la punta de la cola | Primer latido, mofletes |
| **Juvenile (10)** | Cría | Cuerpo en S sobre dos patas; cabeza aparte con hocico | Ala corta de dos dedos, cresta de púas y cola de contrapeso | Placas en el vientre, latido en el muslo |
| **Adult (25)** | Dragón joven | Cuello largo y cabeza pequeña | Ala de tres dedos, cuernos largos, bracito y cola con hoja de rayo | Núcleo en el pecho, garras oscuras, ceja |
| **Final (50, Piedra de Evolución)** | Dragón de pulso | Dos alas desplegadas que le sobrepasan la cabeza y rompen el contorno | Segunda ala, cuernos altos y cola de doble hoja, que leen el elemento | Núcleo grande, franja oscura en la frente |

**No cambia:** la paleta dorada con rayos cian, los ojos inclinados con chispa, los cuernos en lo alto de la cabeza, el ala a la espalda y la línea de latido.

**Anclas de accesorios:** `head` entre los dos cuernos; `neck` en la base del cuello; `back` en el lomo, donde nace el ala (una capa la tapa). De la segunda etapa en adelante tiene los ojos más pequeños que el resto, así que las gafas le quedan grandes.

## Frases de chat de ejemplo
1. «¡Venga, venga, venga! ¿A qué esperamos?»
2. «¿Lo oyes? Ese soy yo. Bueno, es todo. Pero también yo.»
3. «¿Un día malo? Pues se le gana. Dime por dónde empezamos.»

## Brief de arte
Pixel art en 3/4. Cuerpo, cuello y cola en primario, dibujados como una curva lisa con su propia luz y sombra y placas más claras en el vientre; membrana de las alas, cuernos, cresta y hoja de la cola en secundario, con los huesos del ala en primario; garras en primario oscurecido. El núcleo del pecho y la línea de latido son brillos en color literal: no cambian con la paleta. La cola gira con la pose y cuernos y alas laten con los apéndices.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de `examples/primpulso-objetivo.webp`, e importada a 64 px (`scripts/sprites/pixel/imported/primpulso.json`). La paleta por defecto es la de la hoja. Boceto anterior: redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Garras en el acento, ala lejana en segundo plano y segundo par de cuernos oscuros en la etapa final.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "primpulso",
  "name": "Primpulso",
  "description": "Un dragoncito con cuernos de rayo y una línea de latido que le cruza el cuerpo: el eco del primer pulso del Éter. Es impetuoso y orgulloso, y no sabe quedarse quieto.",
  "element": "electric",
  "rarity": "mythic",
  "baseStats": { "hp": 60, "atk": 80, "def": 54, "vel": 70, "esp": 56 },
  "favoriteFood": "spark_candy",
  "spriteKey": "primpulso",
  "personalityBias": { "curiosity": 75, "sociability": 55, "bravery": 85, "affection": 45, "temper": 85 },
  "defaultPalette": { "primary": "#FFE12D", "secondary": "#BB8B2E", "accent": "#1DE2F2" }
}
```
