# Ignisaurio — «El que embiste primero»

> Un pequeño dinosaurio de fuego, robusto y cabezón, con una gorguera coronada de llamas y una maza de brasas en la cola. Cuando se alegra, desprende chispas brillantes.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| fire (Flujo del Fuego) | normal (Eco Cotidiano) | Ofensivo equilibrado | Baya Picante (`spicy_berry`) |

## Clasificación y hábitat
- **Tipo:** dinosaurio de fuego de la familia de los que llevan gorguera.
- **Plan corporal:** cuadrúpedo de gorguera: robusto y cabezón, a cuatro patas, con gorguera detrás de la cabeza, cuernos y cola de maza (ver `references/pixel-style.md`).
- **Tamaño aparente:** mediano, ancho y bajo.
- **Hábitat en el Éter:** cargadores que se calientan de noche y pantallas que se quedan encendidas.
- **Comportamiento social:** amistoso y directo; se acerca a todo el mundo, a veces demasiado deprisa.

## Anatomía y rasgos distintivos
Cuerpo ancho sobre cuatro patas cortas y gruesas, con el vientre y el hocico de color crema. Detrás de la cabeza lleva una gorguera ósea rematada por llamas, que crece con cada etapa hasta parecer una melena de fuego. La cola acaba en una maza redonda de brasas, no en una llama abierta.
- **Rasgos icónicos (silueta):** 1) la gorguera coronada de llamas; 2) la maza de brasas en la punta de la cola.

## Ecología y lore
Hay teléfonos que se calientan en la mesilla mientras alguien no puede dejar de mirar una cosa más. De ese calor pequeño y diario, repetido noche tras noche, nació el primer Ignisaurio. Es un Eco Cotidiano: no viene de una gran historia, sino de un gesto de todos los días. Los Custodios lo conocen por su prisa: va de cabeza hacia lo que le interesa y pregunta después.

## Comportamiento en combate
- **Arquetipo:** ofensivo equilibrado — stat dominante `atk` 55, con `esp` 52 y el resto cerca. Pega primero y no tiene un punto flaco claro, pero tampoco una gran defensa (`def` 45).
- **Skills recomendadas (4):** `ember` (quema desde el nivel 1), `flame_burst` (su golpe elemental), `power_slam` (la embestida le va por carácter), `swift_strike` (remata).
- **Ventajas / debilidades:** fuerte contra planta; débil frente a agua.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 60 (curious) | 55 (friendly) | 65 (brave) | 45 (warm) | 65 (restless) |

Valiente e inquieto, con más ganas de hacer que de pararse a pensar. El cariño lo demuestra jugando, no con palabras.

**Cómo puede evolucionar:** con combates y aventuras se vuelve más atrevido; si pasa mucho tiempo en compañía tranquila, baja el genio y gana afecto.
**Vida autónoma típica:** corretea, embiste cosas para ver qué pasa y propone salir a explorar.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Una brasa con patas | Una bolita redonda, casi todo cabeza | Botón de cuerno en el hocico y una llamita en la colita | Rojo anaranjado liso, ojos enormes |
| **Juvenile (10)** | Aprende a embestir | Cuadrúpedo pequeño y rechoncho | Cuerno corto, dos llamitas donde nacerá la gorguera y cola corta con llama | Vientre y hocico crema |
| **Adult (25)** | Un triceratops joven | Cuadrúpedo robusto, con la gorguera ya abierta | Gorguera granate coronada de llamas, cuerno en el hocico y cola de maza | Grietas de lava en el lomo |
| **Final (50, Piedra de Evolución)** | El que abre camino | Cuadrúpedo imponente; la gorguera dobla el volumen de la cabeza | Melena de llamas alrededor de la gorguera, dos cuernos largos sobre los ojos, placas oscuras y gran maza de brasas | Garras oscuras, mirada seria |

**No cambia:** el rojo con el vientre crema, el cuerno del hocico, el fuego en la cabeza y en la cola, y que mira hacia la derecha.

**Anclas de accesorios:** la cabeza es pequeña y va delante de la gorguera, así que lleva la talla S en las cuatro etapas. `head` sobre la frente, por delante de las llamas; `face` en el ojo; `neck` bajo la barbilla; `back` en el lomo, detrás de la gorguera.

## Frases de chat de ejemplo
1. «¡Vamos, vamos! ¿A qué estamos esperando?»
2. «He embestido esa caja. No había nada dentro. La voy a embestir otra vez.»
3. «¿Mal día? Ponte detrás de mí. Yo voy delante.»

## Brief de arte
Pixel art en 3/4. Cuerpo en primario (lleva el patrón); gorguera, placas y cuernos en secundario; vientre y hocico en el acento. Las llamas y las brasas son colores fijos: no cambian con la paleta de la mascota, para que el fuego siga pareciendo fuego.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de su hoja de diseño aprobada (`examples/ignisaur-diseno.jpg`), e importada a 64 px (`scripts/sprites/pixel/imported/ignisaur.json`). La paleta por defecto es la de la hoja. El diseño cambió al hacer la hoja: era un lagarto bípedo con una llama en la cola y se rehízo como cuadrúpedo de gorguera, para no parecerse a un personaje conocido. El boceto de formas (`PixelSpecies`) sigue siendo el bípedo anterior y está por rehacer; solo coloca los efectos.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "ignisaur",
  "name": "Ignisaurio",
  "description": "Un pequeño dinosaurio de fuego, robusto y cabezón, con una gorguera coronada de llamas y una maza de brasas en la cola. Cuando se alegra, desprende chispas brillantes.",
  "element": "fire",
  "rarity": "normal",
  "baseStats": { "hp": 50, "atk": 55, "def": 45, "vel": 48, "esp": 52 },
  "favoriteFood": "spicy_berry",
  "spriteKey": "ignisaur",
  "personalityBias": { "curiosity": 60, "sociability": 55, "bravery": 65, "affection": 45, "temper": 65 },
  "defaultPalette": { "primary": "#FB2910", "secondary": "#42202B", "accent": "#FFDB85" }
}
```
