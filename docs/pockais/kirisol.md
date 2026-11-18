# Kirisol — «El deseo que echó a correr»

> Un potrillo de patas largas con un cuerno de luz y una crin que deja estela al correr. Es inquieto y noble, y no sabe caminar despacio.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| light (Flujo de la Luz) | legendary (Arquetipo Ancestral) | Veloz | Miel de Alba (`dawn_honey`) |

## Clasificación y hábitat
- **Tipo:** equino de luz.
- **Plan corporal:** cuadrúpedo esbelto: patas largas y finas, cuello alto y hocico alargado, con el cuerpo lejos del suelo. Es la especie de patas más largas (`references/pixel-style.md`).
- **Tamaño aparente:** mediano, alto.
- **Hábitat en el Éter:** las listas de deseos y los mensajes que empiezan por «ojalá».
- **Comportamiento social:** en grupo, siempre el primero en salir corriendo.

## Anatomía y rasgos distintivos
Cuerpo pequeño sobre cuatro patas largas, cuello alto y hocico de potro. El cuerno es luz sólida y crece con la edad. La crin y la cola no pesan: flotan detrás de él y dejan una estela cuando corre.
- **Rasgos icónicos (silueta):** 1) el cuerno de luz; 2) la crin y la cola en estela.

## Ecología y lore
El unicornio es de las historias más viejas que existen, y en el Éter renació de un deseo pedido a una estrella fugaz y escrito después en una nota. Es un Arquetipo Ancestral: el mito le dio la forma y el deseo, las ganas de correr. Dicen los Custodios que un Kirisol no concede deseos, pero que acompaña a quien sale a buscarlos.

## Comportamiento en combate
- **Arquetipo:** veloz — stat dominante `vel` 75, con `atk` 62.
- **Skills recomendadas (4):** `swift_strike` (aprovecha su velocidad), `glimmer` (quema desde el nivel 1), `radiant_beam` (su golpe elemental), `solar_flare` (remate).
- **Ventajas / debilidades:** fuerte contra sombra y débil frente a sombra.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 65 (curious) | 60 (sociable) | 70 (brave) | 50 (warm) | 75 (impulsive) |

Impulsivo y valiente: primero corre y luego pregunta adónde.

**Cómo puede evolucionar:** con aventuras se vuelve un explorador incansable; con rutinas y mimos baja el impulso y gana afecto.
**Vida autónoma típica:** trota por el hábitat, se asoma a la ventana y no para quieto mucho rato.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Recién nacido | Tumbado, con las patas recogidas y la cabeza erguida | Un botón de cuerno y un mechón de cola | Mofletes, ojos enormes con pestaña |
| **Juvenile (10)** | Se pone en pie | De pie sobre cuatro patas largas; cuerpo pequeño | Cuerno corto, crin corta y cola | Cascos dorados, hocico |
| **Adult (25)** | Potro | Cuello alto, cuerpo más largo | Cuerno mayor, crin que cae por el cuello y cola de dos mechones | Motas de luz en el flanco |
| **Final (50, Piedra de Evolución)** | Alicornio del alba | Más grande, con ala, crin y cola que rompen el contorno | Cuerno largo, un ala sobre la grupa, crin en mechones y cola de tres, que leen el elemento | Motas grandes, cascos en el acento con mechón, ceja |

**No cambia:** el pelaje crema con dorado, los ojos con pestaña, el cuerno en la frente y la cola saliendo de la grupa.

**Anclas de accesorios:** `head` en lo alto de la cabeza, junto al cuerno; `neck` en la base del cuello; `back` en el lomo.

## Frases de chat de ejemplo
1. «¿Vamos? ¿Vamos ya? Yo ya estoy yendo.»
2. «He dado la vuelta entera. Dos veces. ¿Otra?»
3. «¿Un día malo? Pide algo. Lo que sea. Y vamos a por ello.»

## Brief de arte
Pixel art en 3/4. Cuerpo, cuello y patas en primario; cuerno, crin, cola, cascos y motas en secundario; cascos de la etapa final en primario oscurecido. La cola gira con la pose, cuerno y crin laten con los apéndices y las cuatro patas dan el paso en diagonal.

**Estado del arte:** redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Patas con rodilla y casco, crin en mechones separados y, en la etapa final, un ala sobre la grupa: el potro pasa a alicornio.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "kirisol",
  "name": "Kirisol",
  "description": "Un potrillo de patas largas con un cuerno de luz y una crin que deja estela al correr. Es inquieto y noble, y no sabe caminar despacio.",
  "element": "light",
  "rarity": "legendary",
  "baseStats": { "hp": 56, "atk": 62, "def": 50, "vel": 75, "esp": 57 },
  "favoriteFood": "dawn_honey",
  "spriteKey": "kirisol",
  "personalityBias": { "curiosity": 65, "sociability": 60, "bravery": 70, "affection": 50, "temper": 75 },
  "defaultPalette": { "primary": "#FFF4D6", "secondary": "#F4A259", "accent": "#B5651D" }
}
```
