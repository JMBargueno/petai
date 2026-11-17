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

## Temperamento sugerido *(lore; el juego no lo asigna por especie)*
<valiente | timido | arribista | curioso> — <por qué encaja>

## Evolución narrativa *(mismo sprite en todas las etapas)*
- **Baby (1):** <…>
- **Juvenile (10):** <…>
- **Adult (25):** <…>
- **Final (50, Piedra de Evolución):** <…>

## Frases de chat de ejemplo
1. «<…>»
2. «<…>»
3. «<…>»
*(Coherentes con la description y el temperamento; frases cortas, de mascota.)*

## Brief de arte
<Brief según references/art-brief.md>

**TODO:** sustituir los placeholders dibujando el `SpeciesArt` en `scripts/sprites/species.ts` y ejecutar `pnpm generate:sprites`.

## Datos (`shared/game-data/species.json`)
```json
{ …entrada exacta… }
```
<Si se crearon skills o comida nuevas, incluir también sus JSON.>
````
