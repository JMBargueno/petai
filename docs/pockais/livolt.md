# Livolt — «La polilla del me gusta»

> Una polilla inquieta de alas chispeantes que nació cuando una bombilla la electrificó. Revolotea hacia todo lo que brilla y le encanta que le hagan caso.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| electric (Flujo de la Chispa) | rare (Espíritu Condensado) | Veloz | Caramelo de Chispa (`spark_candy`) |

## Clasificación y hábitat
- **Tipo:** insecto alado.
- **Tamaño aparente:** pequeño.
- **Hábitat en el Éter:** cerca de las pantallas encendidas y de las notificaciones recién llegadas.
- **Comportamiento social:** en grupo; busca compañía y público.

## Anatomía y rasgos distintivos
Cuerpo redondo cubierto de pelusa, con un collar más claro en el cuello. Vuela a saltitos cortos, de luz en luz. Las antenas le sirven de pararrayos: captan la carga del aire y la descargan por las alas.
- **Rasgos icónicos (silueta):** 1) las alas con una marca de corazón que chispea; 2) las antenas en zigzag.

## Ecología y lore
Una polilla rondaba una bombilla la misma noche en que su Custodio repartía «me gusta» sin parar. La bombilla la electrificó justo cuando un corazón aparecía en pantalla, y ese impulso repetido mil veces quedó condensado en sus alas. Por eso es un Espíritu Condensado: no nació de un dato suelto, sino de un gesto de cariño insistente. Dicen los Custodios que, si le prestas atención, la marca del ala se enciende.

## Comportamiento en combate
- **Arquetipo:** veloz — stat dominante `vel` 65. Es la primera especie rápida del catálogo.
- **Skills recomendadas (4):** `swift_strike` (aprovecha su velocidad), `spark` (entumece desde el nivel 1), `volt_surge` (su golpe elemental principal), `guard` (compensa su defensa baja).
- **Ventajas / debilidades:** fuerte contra agua; débil frente a planta.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 70 (curious) | 75 (sociable) | 45 (steady) | 55 (warm) | 80 (impulsive) |

Nació de un gesto social repetido: va hacia lo que brilla, quiere público y no sabe estarse quieta.

**Cómo puede evolucionar:** con muchas visitas y juegos se vuelve extrovertida y aventurera; con una crianza tranquila y rutinas de sueño baja su impulso y gana afecto.
**Vida autónoma típica:** revolotea por el hábitat, busca a otros Pockai y vuelve una y otra vez a la lámpara.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Aún no vuela; aletea por imitar | Una bola aplastada, sin brazos | Dos muñones de ala y antenas cortas | Sin barriga, mofletes, ojos enormes |
| **Juvenile (10)** | Primeros vuelos cortos | Cuerpo alargado con brazos | Un par de alas y antenas con bolita | Barriga |
| **Adult (25)** | Vuela de luz en luz | Cabeza y torso separados | Cuatro alas; marca de corazón en el ala cercana; collar de pelusa | Manchas en el lomo |
| **Final (50, Piedra de Evolución)** | La chispa ya es suya | Más ancha, con colas de ala que rompen el contorno | Alas con colas y antenas en forma de rayo, que leen el elemento | Franjas, emblema, mirada decidida |

**No cambia:** la paleta ámbar, la forma del ojo y el sitio de alas y antenas.

**Anclas de accesorios:** `head` entre las dos antenas (un gorro las deja a los lados); `back` por delante del ala cercana, así que una capa tapa esa ala.

## Frases de chat de ejemplo
1. «¡Mira, mira! ¿Has visto cómo brillo hoy?»
2. «Esa luz de ahí me está llamando, te lo juro.»
3. «¿Un día malo? Ven, que te enciendo un corazón. Los días malos se van volando.»

## Brief de arte
Pixel art en 3/4, mirando abajo a la derecha. Cuerpo en primario; alas, antenas con bolita y collar en secundario; marca de corazón, tallos de antena y franjas en primario oscurecido. Las alas van detrás del cuerpo y laten con los apéndices.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "livolt",
  "name": "Livolt",
  "description": "Una polilla inquieta de alas chispeantes que nació cuando una bombilla la electrificó. Revolotea hacia todo lo que brilla y le encanta que le hagan caso.",
  "element": "electric",
  "rarity": "rare",
  "baseStats": { "hp": 46, "atk": 54, "def": 44, "vel": 65, "esp": 56 },
  "favoriteFood": "spark_candy",
  "spriteKey": "livolt",
  "personalityBias": { "curiosity": 70, "sociability": 75, "bravery": 45, "affection": 55, "temper": 80 },
  "defaultPalette": { "primary": "#FFD166", "secondary": "#FFEBB3", "accent": "#FF9F1C" }
}
```
