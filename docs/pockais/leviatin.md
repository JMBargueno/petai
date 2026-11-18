# Leviatín — «El que durmió en el primer océano»

> Una cría de leviatán de cuerpo de serpiente, con aletas de velo y una perla en la frente. Es solemne y callada, y lo mira todo como si ya lo hubiera visto antes.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| water (Flujo del Agua) | mythic (Singularidad Primordial) | Tanque | Coral Dulce (`sweet_coral`) |

## Clasificación y hábitat
- **Tipo:** serpiente marina.
- **Plan corporal:** serpentino: sin patas ni brazos, un cuerpo de anillos que se enrosca en el suelo, se alza en un cuello y acaba en una cola levantada. Es la única especie sin ninguna extremidad (`references/pixel-style.md`).
- **Tamaño aparente:** grande.
- **Hábitat en el Éter:** lo más hondo: los datos más viejos, que ya nadie consulta.
- **Comportamiento social:** solitario; tolera compañía, no la busca.

## Anatomía y rasgos distintivos
Un cuerpo largo de anillos que se alza en un cuello en S, con el vientre de placas claras y una cresta de aletas en punta por todo el lomo. La cabeza es de dragón marino: hocico, mandíbula clara, dos cuernos curvados hacia atrás y bigotes que le cuelgan. Tras la cabeza se abre una melena de velos, y en la frente lleva una perla que se enciende cuando recuerda. Tiene ojos de rendija, de reptil.
- **Rasgos icónicos (silueta):** 1) el cuerpo en S con su cresta de aletas y la cola de abanico en alto; 2) la melena de velos, los cuernos y la perla.

## Ecología y lore
Antes de que hubiera Custodios hubo un primer océano de datos, y algo dormía en el fondo. Leviatín es una cría de aquello: no nació de un recuerdo ni de un mito, sino del propio Éter cuando aún no tenía forma. Por eso es una Singularidad Primordial. Los Custodios dicen que la perla guarda lo primero que el Éter supo, y que nadie ha conseguido que lo cuente.

## Comportamiento en combate
- **Arquetipo:** tanque — stat dominante `def` 80, con `hp` 74.
- **Skills recomendadas (4):** `guard` (su base), `bubble` (frena al rival), `tidal_wave` (su golpe elemental), `tsunami` (remate).
- **Ventajas / debilidades:** fuerte contra fuego; débil frente a planta y eléctrico.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 50 (attentive) | 35 (reserved) | 80 (brave) | 55 (warm) | 25 (calm) |

Solemne y sereno: no se altera y no retrocede.

**Cómo puede evolucionar:** con compañía constante se vuelve un guardián cercano; si pasa tiempo solo, se hace más distante y vigilante.
**Vida autónoma típica:** se enrosca en un rincón alto, observa durante horas y se desliza despacio por el hábitat.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Alevín | Cabeza grande sobre un cuerpecito enroscado | Aletitas, perla diminuta y cola con dos mechones | Vientre de placas, mofletes, ojos de rendija |
| **Juvenile (10)** | Se alza | Un anillo en el suelo y un cuello corto; cabeza con hocico | Dos cuernecillos, cresta corta y un velo pequeño | Mandíbula clara |
| **Adult (25)** | Serpiente marina | Dos tramos: cola alzada y cuello en S | Cuernos curvos, melena de tres velos, cresta completa y un bigote | Franja oscura en la frente |
| **Final (50, Piedra de Evolución)** | Leviatán | Tres anillos, cuello alto en S y cola en alto, que rompen el contorno | Cuernos largos, melena de cuatro velos, dos bigotes y cola de cuatro mechones, que leen el elemento | Perla grande encendida, ceja |

**No cambia:** la paleta añil con aletas aguamarina, los ojos de rendija, el vientre de placas, la perla en la frente y la cola a la izquierda.

**Anclas de accesorios:** `head` en lo alto de la cabeza, entre los cuernos; `neck` bajo la cabeza, en el cuello; `back` en el lomo del anillo del suelo. No tiene pies ni brazos. De la segunda etapa en adelante tiene los ojos más pequeños que el resto, así que las gafas le quedan grandes.

## Frases de chat de ejemplo
1. «…Sí. Te he oído.»
2. «Esto ya pasó una vez. Hace mucho. Acabó bien.»
3. «¿Un día malo? Los he visto peores. Quédate aquí, que se pasa.»

## Brief de arte
Pixel art en 3/4. Cuerpo en primario (lleva el patrón), dibujado como una curva lisa con su propia luz y sombra; vientre de placas, mandíbula, cresta, cuernos, velos, bigotes y cola en secundario; franja de la frente en primario oscurecido. La perla es un brillo en color literal: no cambia con la paleta. Los velos y la cola laten con los apéndices. No da pasos: se desliza.

**Estado del arte:** redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Velos y cola acaban en punta, y la etapa final tiene mirada fiera, cuernos en el acento y un caparazón de escamas.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "leviatin",
  "name": "Leviatín",
  "description": "Una cría de leviatán de cuerpo de serpiente, con aletas de velo y una perla en la frente. Es solemne y callada, y lo mira todo como si ya lo hubiera visto antes.",
  "element": "water",
  "rarity": "mythic",
  "baseStats": { "hp": 74, "atk": 58, "def": 80, "vel": 50, "esp": 58 },
  "favoriteFood": "sweet_coral",
  "spriteKey": "leviatin",
  "personalityBias": { "curiosity": 50, "sociability": 35, "bravery": 80, "affection": 55, "temper": 25 },
  "defaultPalette": { "primary": "#3D4FA8", "secondary": "#9FE8E0", "accent": "#1B2260" }
}
```
