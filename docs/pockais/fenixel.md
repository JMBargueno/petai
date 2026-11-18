# Fénixel — «La que vuelve a encenderse»

> Una cría de fénix de plumas encendidas que se apaga y vuelve a prender sin darle importancia. Es soñadora y tozuda, y siempre lo intenta una vez más.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| fire (Flujo del Fuego) | legendary (Arquetipo Ancestral) | Místico ofensivo | Baya Picante (`spicy_berry`) |

## Clasificación y hábitat
- **Tipo:** ave de fuego.
- **Plan corporal:** ave de cuello largo: cabeza pequeña, cuerpo esbelto, patas finas con garras y alas en lugar de brazos. Es la única especie con pico y la única que nace dentro de un cascarón (`references/pixel-style.md`).
- **Tamaño aparente:** mediano.
- **Hábitat en el Éter:** donde algo se ha reiniciado muchas veces y ha vuelto a arrancar.
- **Comportamiento social:** en pareja; se posa cerca de quien no se rinde.

## Anatomía y rasgos distintivos
Cabeza pequeña sobre un cuello largo, pecho dorado, pico corto y ojos rasgados. Las plumas de la cresta, las alas y la cola son llamas en punta que no queman; de adulta, las alas abiertas le sobrepasan la cabeza. Cuando se cansa, se apaga un momento y vuelve a prenderse sola.
- **Rasgos icónicos (silueta):** 1) las alas y la cola de plumas de fuego; 2) el cuello largo con la cresta en estela.

## Ecología y lore
El mito del ave que renace de sus cenizas es más viejo que cualquier pantalla, y en el Éter encontró dónde anidar: un servidor que se cayó y volvió a levantarse mil veces. Es un Arquetipo Ancestral porque no nació de un Custodio concreto, sino de una historia que la humanidad lleva siglos contándose. Dicen que nadie ha visto nunca a un Fénixel apagarse del todo.

## Comportamiento en combate
- **Arquetipo:** místico ofensivo — stat dominante `esp` 75, con `vel` 63.
- **Skills recomendadas (4):** `ember` (quema desde el nivel 1), `flame_burst` (su golpe principal), `inferno` (remate), `recover` (vuelve a encenderse).
- **Ventajas / debilidades:** fuerte contra planta; débil frente a agua.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 70 (curious) | 50 (steady) | 75 (brave) | 55 (warm) | 60 (lively) |

Valiente y curiosa: prueba, falla y vuelve a probar.

**Cómo puede evolucionar:** con aventuras se vuelve intrépida; con una crianza tranquila baja el genio y se hace más cariñosa.
**Vida autónoma típica:** revolotea de mueble en mueble, se acicala las plumas y mira por la ventana.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Aún no ha salido del todo | Medio cuerpo dentro del cascarón, sin patas | Una chispa en la cabeza y el pico | Cascarón dorado, mofletes |
| **Juvenile (10)** | Volantón | Cuerpo de gota sobre patas finas con garras | Alas ya alzadas, cresta de tres plumas y tres plumas de cola | Pecho dorado, ojos más pequeños |
| **Adult (25)** | Fénix joven | Cabeza pequeña sobre un cuello largo; cuerpo esbelto | Alas a medio abrir de cuatro plumas, cola de cuatro, cresta echada hacia atrás | Ceja: mirada decidida |
| **Final (50, Piedra de Evolución)** | Fénix | Alas enormes que le sobrepasan la cabeza y rompen el contorno | Alas de seis plumas de fuego, cola de cinco y cresta en estela, que leen el elemento | Emblema en el pecho |

**No cambia:** la paleta roja y dorada, los ojos rasgados, el pico y la cresta en lo alto de la cabeza.

**Anclas de accesorios:** `head` en lo alto de la cabeza (el gorro tapa la cresta); `neck` en la base del cuello; `back` en el arranque de la cola. De volantón en adelante tiene los ojos más pequeños que el resto, así que las gafas le quedan grandes.

## Frases de chat de ejemplo
1. «¿Otra vez? Otra vez. Venga.»
2. «Me he apagado un poquito. Ya estoy.»
3. «¿Un día malo? Yo de esos tengo muchos. Mañana se vuelve a prender.»

## Brief de arte
Pixel art en 3/4. Cuerpo, cuello y plumón del arranque de las alas en primario; pecho, pico, patas, cascarón y todas las plumas en secundario; garras en primario oscurecido. Cada pluma es una pieza con su contorno. La cola gira con la pose, cresta y alas laten con los apéndices y las patas dan el paso.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "fenixel",
  "name": "Fénixel",
  "description": "Una cría de fénix de plumas encendidas que se apaga y vuelve a prender sin darle importancia. Es soñadora y tozuda, y siempre lo intenta una vez más.",
  "element": "fire",
  "rarity": "legendary",
  "baseStats": { "hp": 54, "atk": 58, "def": 50, "vel": 63, "esp": 75 },
  "favoriteFood": "spicy_berry",
  "spriteKey": "fenixel",
  "personalityBias": { "curiosity": 70, "sociability": 50, "bravery": 75, "affection": 55, "temper": 60 },
  "defaultPalette": { "primary": "#E8483A", "secondary": "#FFD166", "accent": "#6D1600" }
}
```
