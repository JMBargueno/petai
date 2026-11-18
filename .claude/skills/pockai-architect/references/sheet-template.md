# Plantilla de ficha: `docs/pockais/<id>.md`

Escribe en español. Sustituye lo que va entre `<>`.

````markdown
# <Nombre> — «<Epíteto>»

> <description exacta de species.json>

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| <element> (<Flujo del Éter>) | <rarity> (<nombre de lore>) | <arquetipo> | <food name> (`<food id>`) |

## Clasificación y hábitat
- **Tipo:** <bestia / ave / anfibio / constructo de datos…>
- **Plan corporal:** <bípedo / alado / tentacular / cuadrúpedo / flotante / columna / otro> y en qué se diferencia de las especies más parecidas (`pixel-style.md`).
- **Tamaño aparente:** <diminuto / pequeño / mediano>
- **Hábitat en el Éter:** <dónde "vive" en la red y en el mundo del Custodio>
- **Comportamiento social:** <solitario / pareja / grupo>

## Anatomía y rasgos distintivos
<Textura, locomoción, órganos sensoriales. Cada rasgo justificado por su Flujo.>
- **Rasgos icónicos (silueta):** 1) <…> 2) <…>

## Ecología y lore
<Origen como eco de la red (qué impulso humano lo formó), rol, curiosidades, rumores entre Custodios.>

## Comportamiento en combate
- **Arquetipo:** <…> — stat dominante <…>
- **Skills recomendadas (4):** <id> (<por qué>), …  *(solo neutrales o de su elemento, ya existentes o creadas en este cambio)*
- **Ventajas / debilidades:** <según la tabla de tipos>

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| <n> (<keyword>) | <n> (<keyword>) | <n> (<keyword>) | <n> (<keyword>) | <n> (<keyword>) |

<Por qué encaja con su concepto, elemento y description. Keywords según `references/personality.md`.>

**Cómo puede evolucionar:** <2 ejemplos: qué crianza la vuelve, p. ej., aventurera y cuál reservada/cariñosa.>
**Vida autónoma típica:** <qué hará cuando el entrenador no está, según sus dimensiones (explorar, descansar en el hábitat, buscar a otros Pockai, esperar en la puerta).>

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | <…> | <una bola, sin brazos ni cola> | <rasgo en brote> | <sin barriga, mofletes, ojos enormes> |
| **Juvenile (10)** | <…> | <cuerpo alargado con extremidades> | <rasgo pequeño; brazos, cola con punta> | <barriga> |
| **Adult (25)** | <…> | <cabeza y torso separados> | <rasgo completo; cola grande> | <manchas en cabeza y lomo> |
| **Final (50, Piedra de Evolución)** | <…> | <más ancha, con piezas que rompen el contorno> | <rasgo alargado, pieza nueva (segunda cola / alas / melena) y accesorio que lee el elemento> | <franjas, emblema, mirada decidida> |

**No cambia:** <paleta, forma del ojo, sitio del rasgo icónico>

**Anclas de accesorios:** <por etapa, `head`, `face`, `neck` y `back`; salvedades si el rasgo icónico estorba a un gorro o a unas gafas>

## Frases de chat de ejemplo
1. «<…>»
2. «<…>»
3. «<…>»
*(Coherentes con la description y la personalidad de partida; frases cortas, de mascota. Incluye una reacción a «Hoy he tenido un día malo».)*

## Brief de arte
<Brief según references/art-brief.md (3/4, mira abajo-derecha)>

**Estado del arte:** <dibujado y revisado con la hoja de contactos | placeholder (motivo)>

## Datos (`shared/game-data/species.json`)
```json
{ …entrada exacta… }
```
<Si se crearon skills o comida nuevas, incluir también sus JSON.>
````
