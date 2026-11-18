# Cerbito — «El que no deja pasar»

> Un cachorro guardián de tres cabezas y tres colas de sombra, con colmillos y cara de pocos amigos. Gruñe a todo el que se acerca, menos a su Custodio.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| shadow (Flujo de la Sombra) | legendary (Arquetipo Ancestral) | Tanque protector | Mora de Medianoche (`midnight_berry`) |

## Clasificación y hábitat
- **Tipo:** bestia guardiana.
- **Plan corporal:** cuadrúpedo sentado de tres cabezas: grupa en el suelo, patas delanteras rectas y tres cabezas en abanico. Es la única especie que posa sentada y la única con más de una cabeza (`references/pixel-style.md`).
- **Tamaño aparente:** mediano.
- **Hábitat en el Éter:** umbrales: pantallas de inicio de sesión, puertas y copias cifradas.
- **Comportamiento social:** en pareja; un solo Custodio para toda la vida, y desconfianza para los demás.

## Anatomía y rasgos distintivos
Un cachorro robusto con tres cabezas: la central manda, mira y come; las dos laterales asoman detrás, con los ojos encendidos, y vigilan cada una un lado. Tiene las orejas tiesas y oscuras, colmillos que asoman y tres colas de sombra con la punta encendida. Lleva un collar de púas que nadie le puso.
- **Rasgos icónicos (silueta):** 1) las tres cabezas en abanico; 2) las tres colas de sombra y el collar de púas.

## Ecología y lore
El mito del perro de tres cabezas que guarda la puerta del otro mundo llegó al Éter casi intacto: aquí sigue sin dejar pasar a nadie que no conozca. Es un Arquetipo Ancestral, hijo de una historia antigua y no de un recuerdo concreto. Los Custodios dicen que nace con una sola cabeza despierta y que las otras dos abren los ojos cuando ya tiene algo que defender.

## Comportamiento en combate
- **Arquetipo:** tanque protector — `hp` 75 y `def` 72.
- **Skills recomendadas (4):** `guard` (su base), `shade_touch` (debilita al rival), `umbral_wave` (su golpe elemental), `power_slam` (aprovecha su ataque).
- **Ventajas / debilidades:** fuerte contra luz y débil frente a luz.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 45 (steady) | 30 (reserved) | 85 (fearless) | 75 (affectionate) | 75 (impulsive) |

Fiero con todos y blando con uno: gruñe primero y pregunta después, pero a su Custodio no le levanta la voz.

**Cómo puede evolucionar:** con muchas visitas aprende a tolerar a los demás y baja el genio; si pasa tiempo solo, se hace más arisco y vigilante.
**Vida autónoma típica:** monta guardia en la puerta, gruñe a las visitas y se tumba a los pies de su Custodio.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Cachorro dormilón | Tumbado: una hogaza con una cabeza despierta y dos bultos dormidos | Orejas caídas y un jirón de cola | Mofletes, ojos de cachorro |
| **Juvenile (10)** | Aprende a sentarse | Sentado: pata delantera y muslo, con las tres cabezas ya formadas | Las laterales siguen dormidas; orejas en punta, dos colas y collar liso | Pecho claro |
| **Adult (25)** | Guardián | Más alto, con las tres cabezas despiertas | Tres colas, colmillos y collar de púas; las laterales abren los ojos | Mancha en la frente, mirada fiera con ceja |
| **Final (50, Piedra de Evolución)** | Guardián del umbral | Más ancho, con cabezas grandes y púas que rompen el contorno | Una cola larga de sombra con la punta clara (en el arte final las tres colas se funden en una), lomo erizado de púas de sombra y cadena rota colgando | Doble mancha, emblema |

**No cambia:** la paleta violeta, las tres cabezas con la central al frente y las colas saliendo de la grupa. Los ojos pasan de cachorro (baby y juvenile) a fieros (adult y final): es su cambio de cara.

**Anclas de accesorios:** solo la cabeza central lleva accesorios. `head` entre sus dos orejas; `face` en sus ojos; `neck` sobre el collar (la bufanda lo tapa); `back` en el lomo, sobre las colas. Las cabezas laterales no llevan nada.

## Frases de chat de ejemplo
1. «Grrr. Ah, eres tú. Pasa.»
2. «Tres vueltas a la casa. Una por cabeza. Todo en orden.»
3. «¿Un día malo? Dime quién ha sido. No, en serio. Dime quién.»

## Brief de arte
Pixel art en 3/4. Cuerpo y cabezas en primario; pecho, colmillos, púas del collar, ojos de las cabezas laterales y punta de las colas en secundario; orejas, collar, manchas y púas del lomo en primario oscurecido. Las colas giran con la pose. Las cabezas laterales no cambian de expresión: solo la central tiene cara animada.

**Estado del arte:** arte final por hoja objetivo (`target-sheet-pipeline.md`): cada etapa generada con Nano Banana a partir del boceto y de su hoja de diseño aprobada (`examples/cerbito-diseno.jpg`), e importada a 64 px (`scripts/sprites/pixel/imported/cerbito.json`). La paleta por defecto es la de la hoja. Boceto anterior: redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Pelaje con trama, cabezas laterales en segundo plano y garras en el acento en la etapa final.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "cerbito",
  "name": "Cerbito",
  "description": "Un cachorro guardián de tres cabezas y tres colas de sombra, con colmillos y cara de pocos amigos. Gruñe a todo el que se acerca, menos a su Custodio.",
  "element": "shadow",
  "rarity": "legendary",
  "baseStats": { "hp": 75, "atk": 60, "def": 72, "vel": 46, "esp": 47 },
  "favoriteFood": "midnight_berry",
  "spriteKey": "cerbito",
  "personalityBias": { "curiosity": 45, "sociability": 30, "bravery": 85, "affection": 75, "temper": 75 },
  "defaultPalette": { "primary": "#7878C8", "secondary": "#E3CBFA", "accent": "#DA7AFF" }
}
```
