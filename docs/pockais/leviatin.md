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
Un cuerpo largo de anillos, con el vientre claro y aletas dorsales en punta a lo largo del cuello. A los lados de la cabeza se abren dos aletas de velo, y en la frente lleva una perla que se enciende cuando recuerda. Tiene ojos de rendija, de reptil.
- **Rasgos icónicos (silueta):** 1) las aletas de velo a los lados de la cabeza; 2) el cuerpo enroscado con la cola de abanico en alto.

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
| **Baby (1)** | Renacuajo | Una judía tumbada con la punta de la cola en alto | Aletita de cola y perla diminuta | Mofletes, ojos de rendija |
| **Juvenile (10)** | Se alza | Un anillo en el suelo, cuello corto y cabeza aparte | Dos aletas de velo pequeñas y cola con abanico | Vientre claro en el cuello |
| **Adult (25)** | Serpiente marina | Dos anillos y cuello alto | Velos anchos, aletas dorsales y cola de tres mechones | Bandas en el lomo, vientre claro |
| **Final (50, Piedra de Evolución)** | Leviatán | Tres anillos y cuello muy alto, con velos que rompen el contorno | Velos enormes, corona de aletas sobre la perla y cola de cuatro mechones, que leen el elemento | Perla grande, mirada decidida |

**No cambia:** la paleta añil con aletas aguamarina, los ojos de rendija, la perla en la frente y la cola a la izquierda.

**Anclas de accesorios:** `head` en lo alto de la cabeza (el gorro tapa la corona); `neck` bajo la cabeza, en el cuello; `back` en el lomo del anillo trasero. No tiene pies ni brazos.

## Frases de chat de ejemplo
1. «…Sí. Te he oído.»
2. «Esto ya pasó una vez. Hace mucho. Acabó bien.»
3. «¿Un día malo? Los he visto peores. Quédate aquí, que se pasa.»

## Brief de arte
Pixel art en 3/4. Cuerpo en primario (lleva el patrón); vientre, perla, aletas de velo, aletas dorsales y cola en secundario; bandas en primario oscurecido. La cola gira con la pose y los velos y la corona laten con los apéndices. No da pasos: se desliza.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

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
