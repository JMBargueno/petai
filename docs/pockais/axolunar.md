# Axolunar — «El que no tiene prisa»

> Criatura anfibia con branquias en forma de estrella lunar. Transmite una enorme serenidad y le encanta chapotear en agua fresca.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| water (Flujo del Agua) | normal (Eco Cotidiano) | Resistente | Coral Dulce (`sweet_coral`) |

## Clasificación y hábitat
- **Tipo:** ajolote lunar.
- **Plan corporal:** bípedo redondo: de pie, cabeza grande sobre el torso y brazos cortos (ver `references/pixel-style.md`).
- **Tamaño aparente:** mediano, redondeado.
- **Hábitat en el Éter:** modos nocturnos, alarmas suaves y pantallas con el brillo al mínimo.
- **Comportamiento social:** tranquilo y cercano; prefiere estar al lado que hablar mucho.

## Anatomía y rasgos distintivos
Cuerpo turquesa con el vientre verde claro, de pie sobre dos patas cortas. A cada lado de la cabeza le salen branquias de color verde menta, que empiezan como dos brotes y acaban siendo largas hojas abiertas en estrella. La cola es una aleta ancha que le sirve de apoyo.
- **Rasgos icónicos (silueta):** 1) las branquias en estrella a los lados de la cabeza; 2) la cola de aleta.

## Ecología y lore
Cada noche alguien baja el brillo de la pantalla, pone el modo nocturno y escribe un último «buenas noches». De ese gesto repetido, el más tranquilo del día, nació el Axolunar. Es un Eco Cotidiano: no viene de ninguna hazaña, sino de la costumbre de apagar el mundo con cuidado. Los Custodios dicen que mirarlo chapotear baja las pulsaciones.

## Comportamiento en combate
- **Arquetipo:** resistente — stat dominante `hp` 55, con `def` 52 y `esp` 52. Aguanta por vida y defensa y pega poco (`atk` 45). La Nubeballena, también de agua, aguanta por vida y pega con especial.
- **Skills recomendadas (4):** `bubble` (frena desde el nivel 1), `tidal_wave` (su golpe elemental), `guard` (su base), `recover` (alarga el combate).
- **Ventajas / debilidades:** fuerte contra fuego; débil frente a planta y eléctrico.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 45 (attentive) | 50 (friendly) | 40 (steady) | 65 (affectionate) | 20 (energetic) |

Cariñoso y muy sereno: el temperamento más bajo de las tres especies iniciales. No busca líos ni los rehúye.

**Cómo puede evolucionar:** con paseos y aventuras gana curiosidad y valentía; con mimos y siestas se vuelve todavía más afectuoso y calmado.
**Vida autónoma típica:** chapotea, se acurruca cerca de su Custodio y duerme siestas largas.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Una gota con patitas | Una bolita turquesa, casi todo cabeza | Dos branquias cortas a los lados | Mofletes, ojos enormes |
| **Juvenile (10)** | Aprende a ponerse de pie | Pequeño y rechoncho, de pie | Dos branquias a cada lado, bracitos y cola corta de aleta | Vientre verde claro |
| **Adult (25)** | Un ajolote hecho y derecho | Cabeza grande sobre el torso | Tres branquias a cada lado y cola de aleta grande y puntiaguda | Vientre más ancho y marcado |
| **Final (50, Piedra de Evolución)** | El ajolote de la luna | Más alto y esbelto; las branquias rompen el contorno | Branquias largas en forma de hoja, dos cuernecillos oscuros, púas en el lomo y cola de aleta doble | Media luna clara en la frente, turquesa más oscuro, mirada seria |

**No cambia:** el turquesa con el vientre verde claro, las branquias verde menta a los lados de la cabeza y la cola de aleta.

**Anclas de accesorios:** `head` en lo alto de la cabeza, entre las branquias (en la etapa final, entre los cuernecillos); `face` entre los ojos; `neck` donde la cabeza se une al torso; `back` en la espalda, sobre la cola. La etapa final lleva la talla M: su cabeza es más estrecha que la de la adulta.

## Frases de chat de ejemplo
1. «No pasa nada. Respira. Yo me quedo aquí.»
2. «He encontrado un charco. Es el mejor charco que he visto hoy.»
3. «¿Otra vez despierto tan tarde? Ven, que te hago sitio.»

## Brief de arte
Pixel art en 3/4. Cuerpo en primario (lleva el patrón); sombras, cuernecillos y púas en secundario; vientre y branquias en el acento.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de su hoja de diseño aprobada (`examples/axolunar-diseno.jpg`), e importada a 64 px (`scripts/sprites/pixel/imported/axolunar.json`). La paleta por defecto es la de la hoja.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "axolunar",
  "name": "Axolunar",
  "description": "Criatura anfibia con branquias en forma de estrella lunar. Transmite una enorme serenidad y le encanta chapotear en agua fresca.",
  "element": "water",
  "rarity": "normal",
  "baseStats": { "hp": 55, "atk": 45, "def": 52, "vel": 46, "esp": 52 },
  "favoriteFood": "sweet_coral",
  "spriteKey": "axolunar",
  "personalityBias": { "curiosity": 45, "sociability": 50, "bravery": 40, "affection": 65, "temper": 20 },
  "defaultPalette": { "primary": "#3FA5A5", "secondary": "#306373", "accent": "#81EB9B" }
}
```
