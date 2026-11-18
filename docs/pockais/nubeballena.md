# Nubeballena — «La que guarda las copias»

> Un ballenato que flota sobre su propia nube y guarda recuerdos en los puntos de luz de su lomo. Es sereno y soñador, y nunca tiene prisa.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| water (Flujo del Agua) | super_rare (Anomalía Resonante) | Místico resistente | Coral Dulce (`sweet_coral`) |

## Clasificación y hábitat
- **Tipo:** cetáceo del aire.
- **Plan corporal:** flotante sin patas, cuerpo de gota tumbada (ver `references/pixel-style.md`).
- **Tamaño aparente:** grande.
- **Hábitat en el Éter:** las capas altas, donde descansan las copias de seguridad.
- **Comportamiento social:** en grupo, pero a su ritmo; acompaña sin hacer ruido.

## Anatomía y rasgos distintivos
No toca el suelo: flota sobre una nube que va con ella. Respira por un chorro que, en vez de agua, suelta una nube. Cada punto de luz del lomo es algo que alguien no quiso perder.
- **Rasgos icónicos (silueta):** 1) el chorro en forma de nube; 2) la cola de aleta alzada y los puntos de luz del lomo.

## Ecología y lore
Alguien guardó la misma copia de seguridad noche tras noche durante años, por miedo a perder las fotos de su familia. Tanta repetición resonó en las capas altas del Éter y tomó forma de ballenato. Es una Anomalía Resonante porque no nació de un dato, sino del eco de cuidarlo. Los Custodios cuentan que, si le pides algo que has olvidado, uno de sus puntos se enciende.

## Comportamiento en combate
- **Arquetipo:** místico resistente — stat dominante `esp` 70, con `hp` 66. A diferencia del Axolunar (vida y defensa), aguanta por vida y pega con especial.
- **Skills recomendadas (4):** `bubble` (frena desde el nivel 1), `tidal_wave` (su golpe elemental), `recover` (con tanta vida rinde mucho), `guard`.
- **Ventajas / debilidades:** fuerte contra fuego; débil frente a planta y eléctrico.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 60 (curious) | 55 (steady) | 45 (steady) | 70 (affectionate) | 20 (calm) |

La especie más serena del catálogo: cariñosa y sin prisa.

**Cómo puede evolucionar:** con aventuras gana valentía y se vuelve una guía tranquila; con mucha compañía se hace más sociable y juguetona.
**Vida autónoma típica:** flota despacio por el hábitat, se queda mirando por la ventana y duerme mucho.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Una gota que aún no flota | Una gota posada en el suelo | Una nubecita y un brote de cola | Mofletes, ojos enormes |
| **Juvenile (10)** | Despega | Flota sobre su nube; cuerpo alargado | Cola de dos lóbulos, aleta y nube mayor | Panza clara |
| **Adult (25)** | Ya guarda recuerdos | Cuerpo grande y alto | Chorro de nube sobre un tallo, cola alzada, dos aletas | Puntos de luz en el lomo |
| **Final (50, Piedra de Evolución)** | Lleva el cielo encima | Más ancha, con crin de nubes que rompe el contorno | Chorro alto con gotas, cola doble y crin de nubes, que leen el elemento | Franjas, emblema, mirada decidida |

**No cambia:** la paleta, la forma del ojo, el chorro saliendo de lo alto del lomo y la cola a la izquierda.

**Anclas de accesorios:** `head` por delante del chorro, sobre los ojos; `neck` bajo la boca; `back` en el arranque de la cola. No tiene pies: flota.

## Frases de chat de ejemplo
1. «Hoy el aire está blandito. Quédate un rato.»
2. «Eso ya me lo contaste. Lo tengo guardado aquí, mira.»
3. «¿Un día malo? Súbete. Desde arriba todo pesa menos.»

## Brief de arte
Pixel art en 3/4. Cuerpo y cola en primario; panza, nubes, chorro y puntos de luz en secundario; franjas en primario oscurecido. La cola gira con la pose, el chorro late con los apéndices y las nubes de abajo dan el paso al andar.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "nubeballena",
  "name": "Nubeballena",
  "description": "Un ballenato que flota sobre su propia nube y guarda recuerdos en los puntos de luz de su lomo. Es sereno y soñador, y nunca tiene prisa.",
  "element": "water",
  "rarity": "super_rare",
  "baseStats": { "hp": 66, "atk": 44, "def": 54, "vel": 46, "esp": 70 },
  "favoriteFood": "sweet_coral",
  "spriteKey": "nubeballena",
  "personalityBias": { "curiosity": 60, "sociability": 55, "bravery": 45, "affection": 70, "temper": 20 },
  "defaultPalette": { "primary": "#4F86C6", "secondary": "#E8F1FA", "accent": "#1F3F6E" }
}
```
