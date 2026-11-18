# Personalidad de especie (`personalityBias`) — spec 36

Cada Pockai tiene **5 dimensiones de personalidad 0–100** que cambian con lo que vive (Evolution
Engine). La especie solo fija **el punto de partida**: `personalityBias`. Al eclosionar, cada
dimensión = sesgo ± `balance.personality.birth.variance` (15), determinista por `visualSeed`.
Dos individuos de la misma especie nacen parecidos pero no iguales, y la forma de cuidarlos los
separa (uno que explora mucho acaba curioso/aventurero; otro que pasa el día en su hábitat, reservado
y cariñoso).

| Clave | Dimensión | 0–19 | 20–39 | 40–59 | 60–79 | 80–100 |
|---|---|---|---|---|---|---|
| `curiosity` | Curiosidad | indifferent | cautious | attentive | curious | adventurous |
| `sociability` | Sociabilidad | solitary | reserved | friendly | sociable | outgoing |
| `bravery` | Valentía | fearful | timid | steady | brave | daring |
| `affection` | Afectividad | aloof | independent | warm | affectionate | devoted |
| `temper` | Temperamento | calm | energetic | lively | restless | impulsive |

Las bandas, keywords, etiquetas en español y frases de prompt viven en
`shared/game-data/balance.json → personality.dimensions` (fuente de verdad; no las copies a la especie).

## Qué mueve cada dimensión (para diseñar con sentido)
- **curiosity** → explorar en la vida autónoma, encontrar objetos, preguntas en el chat, aventuras.
- **sociability** → encuentros con Pockai de amigos, visitas de hábitat; baja = prefiere su rincón.
- **bravery** → combate (cura/se protege más tarde si es alta), propone explorar; baja = busca refugio.
- **affection** → consuela, se acurruca, espera al entrenador; baja = cariño con hechos, no palabras.
- **temper** → juega e invita a jugar; en combate se protege menos. Baja = calma, siestas.

## Reglas de diseño del sesgo
1. **Enteros en [15, 85]**: nunca en los extremos; la experiencia debe poder mover a la criatura.
2. **Al menos un rasgo marcado**: rango (máx − mín) ≥ 20. Un perfil plano no tiene carácter.
3. **Coherente con la `description`** (que también entra en el prompt): si dices "serena", `temper` bajo;
   si dices "vivaz", `temper` alto; "le encanta chapotear con otros" → `sociability` alta.
4. **Coherente con el arquetipo de combate**, sin calcarlo: un tanque puede ser tímido (gracioso)
   pero no debería ser temerario e impulsivo a la vez que defensivo sin explicarlo en la ficha.
5. **Distinto de las demás especies**: distancia L1 ≥ 25 con cualquier otra (`check_species.mjs` avisa).
6. **El elemento sugiere, no obliga**: fuego tiende a temper/bravery altos; agua a temper bajo y
   affection alta; planta a curiosity/sociability; eléctrico a temper/curiosity; sombra a
   sociability baja; luz a affection/sociability. Rompe la tendencia si el concepto lo pide.

## Especies actuales (referencia)
| Especie | curiosity | sociability | bravery | affection | temper |
|---|---|---|---|---|---|
| ignisaur | 60 | 55 | 65 | 45 | 65 |
| axolunar | 45 | 50 | 40 | 65 | 20 |
| florabud | 65 | 60 | 35 | 60 | 35 |

## Lo que NO se diseña por especie
Las bandas/keywords, las reglas de evolución, la capacidad de memoria y la vida autónoma son globales
(`balance.json → personality`). El temperamento heredado (`valiente | timido | arribista | curioso`)
y el `trait` de notificaciones ya **no se asignan**: se derivan de las dimensiones.
