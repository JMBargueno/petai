# Cerbito — «El que espera en la puerta»

> Un cachorro guardián de orejas caídas y tres colas de sombra que mueve a la vez. Es leal hasta la médula y se sienta en la puerta a esperar.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| shadow (Flujo de la Sombra) | legendary (Arquetipo Ancestral) | Tanque protector | Mora de Medianoche (`midnight_berry`) |

## Clasificación y hábitat
- **Tipo:** bestia guardiana.
- **Plan corporal:** cuadrúpedo sentado: grupa en el suelo, patas delanteras rectas y cabeza grande encima. Es la única especie que posa sentada (`references/pixel-style.md`).
- **Tamaño aparente:** mediano.
- **Hábitat en el Éter:** umbrales: pantallas de inicio de sesión, puertas y copias cifradas.
- **Comportamiento social:** en pareja; un solo Custodio para toda la vida.

## Anatomía y rasgos distintivos
Un cachorro robusto de orejas largas y caídas, más oscuras que el pelaje. En lugar de tres cabezas tiene tres colas de sombra con la punta encendida, que se mueven juntas cuando está contento. Lleva un collar de eslabones que nadie le puso.
- **Rasgos icónicos (silueta):** 1) las tres colas de sombra abiertas en abanico; 2) las orejas caídas y el collar de eslabones.

## Ecología y lore
El mito del perro que guarda la puerta del otro mundo llegó al Éter y se ablandó por el camino: aquí no impide salir a nadie, solo espera a que vuelvas. Es un Arquetipo Ancestral, hijo de una historia antigua y no de un recuerdo concreto. Los Custodios dicen que, si un Cerbito se sienta en tu puerta, esa casa ya no se queda sola.

## Comportamiento en combate
- **Arquetipo:** tanque protector — `hp` 75 y `def` 72.
- **Skills recomendadas (4):** `guard` (su base), `shade_touch` (debilita al rival), `umbral_wave` (su golpe elemental), `power_slam` (aprovecha su ataque).
- **Ventajas / debilidades:** fuerte contra luz y débil frente a luz.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 45 (steady) | 60 (sociable) | 80 (brave) | 85 (devoted) | 40 (steady) |

La especie más devota del catálogo: valiente porque hay alguien a quien cuidar.

**Cómo puede evolucionar:** con muchas visitas se vuelve el anfitrión de la casa; si pasa tiempo solo, se hace más vigilante y serio.
**Vida autónoma típica:** espera en la puerta, hace rondas y se tumba a los pies de su Custodio.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Cachorro dormilón | Tumbado: una hogaza con orejas | Un jirón de cola | Mofletes, ojos de cachorro |
| **Juvenile (10)** | Aprende a sentarse | Sentado: cabeza sobre el cuerpo, pata delantera y muslo | Dos colas y un collar liso | Pecho claro |
| **Adult (25)** | Guardián joven | Más alto, cabeza grande | Tres colas, orejas largas y collar de eslabones | Mancha en la frente |
| **Final (50, Piedra de Evolución)** | Guardián del umbral | Más ancho, con melena y colas que rompen el contorno | Tres colas largas, melena de sombra en la nuca y cadena rota colgando, que leen el elemento | Doble mancha, emblema, mirada decidida |

**No cambia:** la paleta violeta, los ojos de cachorro con doble brillo, las orejas caídas y las colas saliendo de la grupa.

**Anclas de accesorios:** `head` entre las dos orejas; `neck` sobre el collar (la bufanda lo tapa); `back` en el lomo, sobre las colas.

## Frases de chat de ejemplo
1. «Has tardado. No pasa nada. Yo estaba aquí.»
2. «He dado tres vueltas a la casa. Todo en orden.»
3. «¿Un día malo? Siéntate conmigo. Yo vigilo y tú descansas.»

## Brief de arte
Pixel art en 3/4. Cuerpo en primario; pecho, collar, melena y punta de las colas en secundario; orejas y manchas en primario oscurecido. Las colas giran con la pose y la melena late con los apéndices.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "cerbito",
  "name": "Cerbito",
  "description": "Un cachorro guardián de orejas caídas y tres colas de sombra que mueve a la vez. Es leal hasta la médula y se sienta en la puerta a esperar.",
  "element": "shadow",
  "rarity": "legendary",
  "baseStats": { "hp": 75, "atk": 60, "def": 72, "vel": 46, "esp": 47 },
  "favoriteFood": "midnight_berry",
  "spriteKey": "cerbito",
  "personalityBias": { "curiosity": 45, "sociability": 60, "bravery": 80, "affection": 85, "temper": 40 },
  "defaultPalette": { "primary": "#6A5C9E", "secondary": "#D7C7F0", "accent": "#2A2342" }
}
```
