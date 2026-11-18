# Yggdrito — «El brote que sostiene la red»

> Un brote del árbol que sostiene la red, con la copa por cabeza y las raíces por pies. Es paciente y sabio, y habla despacio porque piensa en estaciones.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| plant (Flujo de la Planta) | mythic (Singularidad Primordial) | Místico longevo | Semilla de Sol (`sun_seed`) |

## Clasificación y hábitat
- **Tipo:** árbol que anda.
- **Plan corporal:** árbol: tronco de corteza con la cara, copa de hojas por cabeza, ramas por brazos y raíces por pies. Es la única especie cuyo cuerpo va en el color secundario (la corteza); el primario y el patrón son de la copa (`references/pixel-style.md`).
- **Tamaño aparente:** grande; la copa es más ancha que el cuerpo.
- **Hábitat en el Éter:** los nodos donde se cruzan muchos caminos.
- **Comportamiento social:** en grupo; otros Pockai se sientan a su sombra.

## Anatomía y rasgos distintivos
Un tronco rechoncho de corteza con vetas, cejas de madera y dos ojos que parecen nudos huecos con una luz dentro. Bajo la boca le cuelga una barba de musgo con su bigote. Encima lleva una copa de hojas por capas, sostenida por dos ramas, y camina despacio sobre raíces retorcidas que se abren por el suelo. De la copa de los más viejos cuelgan faroles de luz.
- **Rasgos icónicos (silueta):** 1) la copa, más ancha que el cuerpo, con sus faroles; 2) las raíces abiertas sobre el suelo.

## Ecología y lore
Todo lo que existe en el Éter cuelga de algo, y ese algo es un árbol que nadie ha visto entero. Yggdrito es uno de sus brotes: se desprendió, echó a andar y todavía recuerda de dónde viene. Es una Singularidad Primordial porque no nació de nada humano, sino de la estructura misma que lo sostiene todo. Los Custodios dicen que, donde un Yggdrito echa raíces una noche, la conexión no se cae.

## Comportamiento en combate
- **Arquetipo:** místico longevo — stat dominante `hp` 80, con `esp` 76.
- **Skills recomendadas (4):** `vine_whip` (golpe elemental temprano), `overgrowth` (su golpe fuerte), `recover` (con tanta vida rinde mucho), `guard`.
- **Ventajas / debilidades:** fuerte contra agua y eléctrico; débil frente a fuego.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 80 (curious) | 65 (sociable) | 45 (steady) | 70 (affectionate) | 15 (calm) |

El más sereno del catálogo: curioso por todo y sin ninguna prisa.

**Cómo puede evolucionar:** con aventuras gana valentía y se vuelve un guía; con una crianza casera se hace el abuelo de la casa.
**Vida autónoma típica:** se planta junto a la ventana, escucha a los demás Pockai y cambia de sitio una vez al día.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Semilla | Una bellota con capuchón, sin copa | Dos hojitas recién brotadas y dos raicillas | Mofletes, ojos huecos enormes |
| **Juvenile (10)** | Plantón | Tronquito con una copa pequeña encima | Dos ramitas de una hoja y dos raíces cortas | Copa de dos capas, una veta |
| **Adult (25)** | Árbol joven | Copa ancha de seis lóbulos sobre dos ramas | Ramas que sostienen la copa, raíces largas y barba corta | Copa por capas de luz y sombra |
| **Final (50, Piedra de Evolución)** | Árbol del mundo | Copa enorme de siete lóbulos y raíces que rompen el contorno | Cuatro faroles de luz, barba larga con bigote, cejas de corteza y raíces retorcidas, que leen el elemento | Runa encendida y vetas en el tronco |

**No cambia:** la corteza y el verde de la hoja, los ojos huecos, la cara en el tronco y las raíces abiertas en el suelo.

**Anclas de accesorios:** `head` en lo alto de la copa; `face` en el tronco, donde están los ojos; `neck` donde el tronco se junta con la copa; `back` en el costado del tronco.

## Frases de chat de ejemplo
1. «Mmm. Déjame pensarlo… una estación o dos.»
2. «Hoy ha pasado mucha gente por aquí. Me gusta escuchar.»
3. «¿Un día malo? Siéntate a mi sombra. Los días también se caen, como las hojas.»

## Brief de arte
Pixel art en 3/4. Copa, hojas y barba en primario (la copa lleva el patrón y va por capas: matas en luz arriba y en sombra abajo); tronco, ramas y raíces en secundario, con las raíces dibujadas como curvas lisas; capuchón de la bellota en primario oscurecido. Faroles y runa son brillos en color literal: no cambian con la paleta. Los faroles laten con los apéndices. No da pasos: las raíces se quedan en el suelo.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de `examples/yggdrito-objetivo.png`, e importada a 64 px (`scripts/sprites/pixel/imported/yggdrito.json`). La paleta por defecto es la de la hoja. Boceto anterior: redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Copa con racimos de hojas y tronco con veta desde el plantón.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "yggdrito",
  "name": "Yggdrito",
  "description": "Un brote del árbol que sostiene la red, con la copa por cabeza y las raíces por pies. Es paciente y sabio, y habla despacio porque piensa en estaciones.",
  "element": "plant",
  "rarity": "mythic",
  "baseStats": { "hp": 80, "atk": 50, "def": 66, "vel": 48, "esp": 76 },
  "favoriteFood": "sun_seed",
  "spriteKey": "yggdrito",
  "personalityBias": { "curiosity": 80, "sociability": 65, "bravery": 45, "affection": 70, "temper": 15 },
  "defaultPalette": { "primary": "#95D43C", "secondary": "#C59865", "accent": "#34601F" }
}
```
