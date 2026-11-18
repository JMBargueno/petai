# Primpulso — «El eco del Primer Latido»

> Un dragoncito con cuernos de rayo y una línea de latido que le cruza el cuerpo: el eco del primer pulso del Éter. Es impetuoso y orgulloso, y no sabe quedarse quieto.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| electric (Flujo de la Chispa) | mythic (Singularidad Primordial) | Ofensivo | Caramelo de Chispa (`spark_candy`) |

## Clasificación y hábitat
- **Tipo:** dragón de pulso.
- **Plan corporal:** dragón bípedo inclinado, de terópodo: cuerpo tumbado hacia delante sobre dos patas fuertes, cuello que avanza, hocico, bracitos y una cola larga de contrapeso. Es la única especie que camina inclinada (`references/pixel-style.md`).
- **Tamaño aparente:** grande.
- **Hábitat en el Éter:** allí donde algo se enciende por primera vez.
- **Comportamiento social:** en pareja; respeta a quien le aguanta el ritmo.

## Anatomía y rasgos distintivos
Camina sobre dos patas fuertes, con el cuerpo echado hacia delante y la cola como contrapeso. Tiene la cabeza pequeña y con hocico, y dos cuernos que son rayos quietos. Una línea de latido le cruza el costado y parpadea al ritmo de su pulso; de adulto le salen alas hechas de rayo.
- **Rasgos icónicos (silueta):** 1) los cuernos y las alas de rayo; 2) la cola larga acabada en rayo y la línea de latido.

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
| **Baby (1)** | Chispa | Una bola con una cola corta | Dos cuernecillos de rayo y la punta de la cola | Primer latido, mofletes |
| **Juvenile (10)** | Cría | Inclinado: cabeza aparte con hocico, muslo y cola de contrapeso | Cuernos mayores, una púa de chispa y bracitos | Latido más largo |
| **Adult (25)** | Dragón joven | Cabeza pequeña sobre un cuello largo; cuerpo esbelto | Cuernos altos, alas cortas de rayo y cola larga | Ceja, ojos más pequeños |
| **Final (50, Piedra de Evolución)** | Dragón de pulso | Alas enormes que le sobrepasan la cabeza y rompen el contorno | Alas de cinco rayos, cuernos largos y cola de tridente, que leen el elemento | Núcleo en el pecho, garras oscuras |

**No cambia:** la paleta dorada con rayos cian, los ojos inclinados con chispa, los cuernos en lo alto de la cabeza y la línea de latido.

**Anclas de accesorios:** `head` entre los dos cuernos; `neck` en la base del cuello; `back` en el lomo, delante de las alas. De adulto tiene los ojos más pequeños que el resto, así que las gafas le quedan grandes.

## Frases de chat de ejemplo
1. «¡Venga, venga, venga! ¿A qué esperamos?»
2. «¿Lo oyes? Ese soy yo. Bueno, es todo. Pero también yo.»
3. «¿Un día malo? Pues se le gana. Dime por dónde empezamos.»

## Brief de arte
Pixel art en 3/4. Cuerpo, cuello, cola y patas en primario; cuernos, alas, púas, punta de la cola y línea de latido en secundario; núcleo y garras de la etapa final en primario oscurecido. La cola gira con la pose y cuernos y alas laten con los apéndices.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

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
  "defaultPalette": { "primary": "#F2C230", "secondary": "#7DF9FF", "accent": "#8A5A00" }
}
```
