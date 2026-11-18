# Florabrote — «El que crece con la música»

> Un pequeño brote vegetal que responde a la música y a la luz solar. Absorbe la energía de la naturaleza para curarse.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| plant (Flujo de la Planta) | normal (Eco Cotidiano) | Místico de apoyo | Semilla de Sol (`sun_seed`) |

## Clasificación y hábitat
- **Tipo:** espíritu vegetal que va de brote a flor.
- **Plan corporal:** bípedo redondo: de pie, cabeza grande sobre el torso y brazos cortos (ver `references/pixel-style.md`).
- **Tamaño aparente:** pequeño y estrecho; crece hacia arriba.
- **Hábitat en el Éter:** listas de reproducción de la mañana y ventanas por las que entra el sol.
- **Comportamiento social:** sociable y curioso, pero se asusta con facilidad.

## Anatomía y rasgos distintivos
Cuerpo verde menta, de pie sobre dos patas, con hojas en la cabeza y una hoja por cola. Con cada etapa estrena una pieza vegetal: primero una hojita, luego dos hojas, después un collar de pétalos rosas y, al final, una gran flor abierta sobre la cabeza.
- **Rasgos icónicos (silueta):** 1) las hojas (y luego la flor) de lo alto de la cabeza; 2) el collar de pétalos y la cola de hojas.

## Ecología y lore
Hay quien pone la misma canción cada mañana mientras sube la persiana. Esa mezcla de música y primera luz, repetida a diario, hizo brotar al Florabrote. Es un Eco Cotidiano: nació de una rutina pequeña, no de un gran momento. Los Custodios cuentan que sus hojas se mueven al compás aunque nadie más oiga la música.

## Comportamiento en combate
- **Arquetipo:** místico de apoyo — stat dominante `esp` 56, con `hp` 52 y `def` 50. Pega con especial y se cura; es el más lento de las tres especies iniciales (`vel` 44).
- **Skills recomendadas (4):** `vine_whip` (golpe elemental temprano), `razor_leaf` (su golpe fuerte), `recover` (absorbe energía para curarse, como dice su descripción), `guard`.
- **Ventajas / debilidades:** fuerte contra agua y eléctrico; débil frente a fuego.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 65 (curious) | 60 (sociable) | 35 (timid) | 60 (affectionate) | 35 (energetic) |

Curioso y cariñoso, pero tímido: quiere verlo todo y prefiere verlo acompañado.

**Cómo puede evolucionar:** con aventuras y combates pierde el miedo; si se queda siempre en su hábitat, se vuelve más reservado y más pegado a su Custodio.
**Vida autónoma típica:** se pone al sol, se balancea cuando suena música y sigue a su Custodio a todas partes.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Un capullo con patas | Un capullo redondo acabado en punta | Una sola hojita encima | Verde menta liso, ojos enormes |
| **Juvenile (10)** | El brote se pone de pie | Pequeño y rechoncho, de pie | Dos hojas en la cabeza y una hoja por cola | Vientre verde muy claro |
| **Adult (25)** | Empieza a florecer | Cabeza sobre un torso más alto | Collar de pétalos rosas, dos hojas grandes en la cabeza y cola de dos hojas | Vientre claro, rosa por primera vez |
| **Final (50, Piedra de Evolución)** | El espíritu en flor | Más alto y ancho; la flor rompe el contorno por arriba | Gran flor rosa abierta sobre la cabeza, collar grande de pétalos, cola de tres hojas afiladas y enredaderas oscuras en los brazos | Emblema de hoja en el pecho, mirada seria |

**No cambia:** el verde menta, las piezas vegetales en lo alto de la cabeza y la cola de hojas.

**Anclas de accesorios:** `head` en lo alto de la cabeza, entre las hojas; en la etapa final el gorro se posa sobre la flor, que es lo más alto. `face` entre los ojos; `neck` sobre el collar de pétalos (la bufanda lo tapa); `back` en la espalda, sobre la cola. Lleva la talla M desde la etapa juvenil: la cabeza no crece tanto como el cuerpo.

## Frases de chat de ejemplo
1. «¿Has oído eso? ¡Ponla otra vez!»
2. «Hoy entra el sol por aquí. Me quedo un ratito, ¿vale?»
3. «Eso da un poco de miedo… ¿Vamos juntos?»

## Brief de arte
Pixel art en 3/4. Cuerpo y hojas en primario (llevan el patrón); pétalos y flor en secundario; sombras y enredaderas en el acento.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de su hoja de diseño aprobada (`examples/florabud-diseno.jpg`), e importada a 64 px (`scripts/sprites/pixel/imported/florabud.json`). La paleta por defecto es la de la hoja.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "florabud",
  "name": "Florabrote",
  "description": "Un pequeño brote vegetal que responde a la música y a la luz solar. Absorbe la energía de la naturaleza para curarse.",
  "element": "plant",
  "rarity": "normal",
  "baseStats": { "hp": 52, "atk": 48, "def": 50, "vel": 44, "esp": 56 },
  "favoriteFood": "sun_seed",
  "spriteKey": "florabud",
  "personalityBias": { "curiosity": 65, "sociability": 60, "bravery": 35, "affection": 60, "temper": 35 },
  "defaultPalette": { "primary": "#73E1A5", "secondary": "#FFBBC6", "accent": "#458D80" }
}
```
