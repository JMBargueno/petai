# Inktopus — «El guardián del diario»

> Un pulpito reservado que guarda secretos en gotas de tinta. Observa todo con curiosidad desde su rincón y solo se abre con quien se gana su confianza.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| shadow (Flujo de la Sombra) | rare (Espíritu Condensado) | Místico | Mora de Medianoche (`midnight_berry`) |

## Clasificación y hábitat
- **Tipo:** molusco de tinta.
- **Tamaño aparente:** pequeño.
- **Hábitat en el Éter:** carpetas ocultas, notas sin compartir y borradores que nunca se enviaron.
- **Comportamiento social:** solitario; elige a muy pocos.

## Anatomía y rasgos distintivos
Manto en punta, como una capucha, que le da aire de encapuchado. Se desplaza sobre sus tentáculos y deja pequeñas gotas de tinta allí donde se detiene a pensar. La tinta no mancha: guarda lo que ha visto.
- **Rasgos icónicos (silueta):** 1) los tentáculos abiertos que gotean tinta; 2) el manto en punta.

## Ecología y lore
Nació de un diario privado escrito noche tras noche y nunca enseñado a nadie. Tanto celo condensó la tinta en una criatura que no olvida. Es un Espíritu Condensado porque su origen es una pasión guardada durante años. Entre Custodios se dice que un Inktopus no cuenta un secreto ni aunque se lo pidas, pero que te deja una gota de tinta en la mano cuando confía en ti.

## Comportamiento en combate
- **Arquetipo:** místico — stat dominante `esp` 65, con buena defensa.
- **Skills recomendadas (4):** `shade_touch` (debilita la defensa pronto), `umbral_wave` (su golpe principal), `guard` (aguanta mientras erosiona), `recover` (alarga el combate, que es donde gana).
- **Ventajas / debilidades:** fuerte contra luz y débil frente a luz (sombra y luz se dañan mutuamente).

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 75 (curious) | 30 (reserved) | 40 (steady) | 60 (affectionate) | 25 (energetic) |

Lo mira todo y no se acerca a casi nadie: curiosidad alta con sociabilidad baja. Su cariño es callado.

**Cómo puede evolucionar:** con visitas frecuentes y juego gana sociabilidad y se vuelve un confidente; si pasa mucho tiempo solo, se hace más reservado y más devoto de su Custodio.
**Vida autónoma típica:** explora rincones del hábitat, se queda observando desde un mueble y espera en la puerta.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Una gota recién caída | Una gota: bola con el manto en punta | Dos muñones de tentáculo | Sin barriga, mofletes, ojos enormes |
| **Juvenile (10)** | Empieza a guardar cosas | Manto alargado | Cuatro tentáculos; el primero ya gotea tinta | Barriga |
| **Adult (25)** | Ya tiene secretos propios | Cabeza encapuchada y torso | Seis tentáculos abiertos, dos con gota | Manchas de tinta |
| **Final (50, Piedra de Evolución)** | Custodio de mil secretos | Más ancho, con tentáculos a tres alturas | Ocho tentáculos y una corona de gotas suspendidas, que lee el elemento | Franjas, emblema, mirada decidida |

**No cambia:** la paleta pizarra, la forma del ojo, el manto en punta y los tentáculos saliendo de la base.

**Anclas de accesorios:** `head` en la punta del manto (un gorro la cubre); no tiene brazos, así que la bufanda queda bien visible.

## Frases de chat de ejemplo
1. «Hoy he visto algo. Luego te lo cuento... quizá.»
2. «Me gusta este rincón. Desde aquí se ve todo.»
3. «¿Un día malo? Cuéntamelo a mí. Lo guardo y ya no pesa.»

## Brief de arte
Pixel art en 3/4. Cuerpo y tentáculos en primario; barriga en secundario; gotas, manchas y corona en primario oscurecido. Los tentáculos traseros giran con la cola; los delanteros hacen de pies.

**Estado del arte:** dibujado y revisado con la hoja de contactos.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "inktopus",
  "name": "Inktopus",
  "description": "Un pulpito reservado que guarda secretos en gotas de tinta. Observa todo con curiosidad desde su rincón y solo se abre con quien se gana su confianza.",
  "element": "shadow",
  "rarity": "rare",
  "baseStats": { "hp": 53, "atk": 44, "def": 55, "vel": 48, "esp": 65 },
  "favoriteFood": "midnight_berry",
  "spriteKey": "inktopus",
  "personalityBias": { "curiosity": 75, "sociability": 30, "bravery": 40, "affection": 60, "temper": 25 },
  "defaultPalette": { "primary": "#4A4E69", "secondary": "#9A8C98", "accent": "#22223B" }
}
```
