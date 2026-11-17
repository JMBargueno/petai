# Spec: Cerebro del Pockai — personalidad, memoria, vida autónoma y orquestador de IA

## ID
36 — Cerebro del Pockai (Personality / Memory / Conversation / Behavior / Evolution Engine)

## Resumen
Cada Pockai tiene ahora **5 dimensiones de personalidad 0–100** (Curiosidad, Sociabilidad, Valentía,
Afectividad, Temperamento), cada rango con su **keyword**. No son etiquetas: cambian con lo que la
criatura vive y deciden cómo habla, cómo reacciona, qué hace cuando estás fuera y cómo pelea.
La memoria pasa a tener **tres capas** con capacidad limitada (episódica, semántica, emocional) y el
backend elige qué recuerdos ve el LLM en cada interacción. Cuando el entrenador no está, la
criatura tiene **vida autónoma** simulada por intervalos, sin LLM. Toda conversación pasa por un
**orquestador**: contexto + memoria + personalidad → LLM → validación con reglas de juego → game
engine → respuesta + animación + memoria.

Dos criaturas idénticas (misma especie, mismas stats) acaban siendo distintas:
- **Pockai A**: su entrenador juega mucho con él y lo lleva de aventura → sube Curiosidad y
  Temperamento → explora solo, encuentra objetos, propone salir, en combate se protege menos.
- **Pockai B**: atención tranquila, pasa el tiempo en su hábitat → baja Sociabilidad, sube
  Afectividad → descansa en casa, espera en la puerta, consuela y se acurruca.

Esto lo comprueba un test (`mind.engines.spec.ts`, «dos criaturas idénticas divergen…»).

## Decisiones tomadas (con el propietario del producto)
| Pregunta | Decisión |
|---|---|
| Alcance | Fase 1 en backend + diseño completo + skill. Clientes, pendiente (ver final). |
| Valores iniciales | Sesgo de la especie (`personalityBias` en species.json) ± 15, determinista por `visualSeed`. |
| Rasgo y temperamento antiguos | Se **derivan** de las 5 dimensiones (no se rompen genes, aventura ni notificaciones). Mascotas existentes: se calculan de forma perezosa respetando su rasgo anterior. |
| Combate | La personalidad sesga **decisiones**, no stats, con un tope de ±5 % en los umbrales. Sigue siendo determinista. |
| Vida autónoma y LLM | Solo reglas (coste ≈ 0). El LLM solo **narra**: cuando hablas con la mascota, los episodios autónomos le llegan como recuerdos y los cuenta con su voz, en la misma llamada del chat. |
| Disparo de la vida autónoma | Perezosa al leer la mascota + barrido social ligero por cron (cada 2 h) para encuentros entre mascotas de amigos. |
| Capacidad de memoria | Por nivel de inteligencia (charla/memoria/agente) × multiplicador del plan (free ×1, pro ×2). |
| Evolution Engine | Deriva de personalidad por experiencias (no cambia la forma física). |

---

## 1. Arquitectura

### 1.1 Componentes
| Componente | Responsabilidad | Código |
|---|---|---|
| **Personality Engine** | Personalidad y temperamento: dimensiones, keywords, prompt, sesgo de combate, campos heredados | `backend/src/modules/mind/personality.engine.ts`, `mind.service.ts` |
| **Memory Engine** | Recuerdos y experiencia: 3 capas, capacidad, olvido, selección de lo relevante | `memory.engine.ts`, `mind-memory.service.ts` |
| **Conversation Engine** | Interpreta el mensaje del entrenador (intención, sentimiento, si merece recordarse). El LLM redacta. | `conversation.engine.ts` + `ai/chat.service.ts` |
| **Behavior Engine** | Decide la reacción (acción + animación), valida acciones con las reglas del juego, define sus efectos | `behavior.engine.ts` |
| **Evolution Engine** | Interpreta experiencias como deriva de personalidad (topes diarios, elasticidad) | `evolution.engine.ts`, `evolution.listener.ts` |
| Vida autónoma | Simulación por intervalos y barrido social | `autonomy.engine.ts`, `autonomy.service.ts` |

Los `*.engine.ts` son **funciones puras** (sin BD, sin reloj, sin azar no sembrado): se testean
aislados. Los `*.service.ts` cargan/guardan y orquestan.

### 1.2 Un único perfil de criatura
Todos los motores trabajan sobre `CreatureProfile` (`mind.types.ts`), que `MindService.profile(pet)`
construye a partir de la fila `Pet`, su especie y `balance.personality`:

```ts
{ petId, userId, name, speciesId, element,
  dims: { curiosity, sociability, bravery, affection, temper },     // 0-100
  traits: { curiosity: { value, keyword, label }, … },              // keyword por rango
  legacy: { trait, temperament },                                   // derivados
  mood, bondingTier, intelligenceTier, vitals }
```

### 1.3 Módulos y dependencias
`MindModule` (nuevo) importa solo `GameDataModule` y `BillingModule`. Lo usan `PetsModule`
(vida autónoma en `getPetById`), `HatchingModule` (personalidad al nacer) y `AiModule` (orquestador).
No hay ciclos.

---

## 2. Personalidad

### 2.1 Dimensiones y keywords
Fuente de verdad: `shared/game-data/balance.json → personality.dimensions` (con la frase de prompt de
cada banda). Bandas: 0–19, 20–39, 40–59, 60–79, 80–100.

| Dimensión | 0–19 | 20–39 | 40–59 | 60–79 | 80–100 |
|---|---|---|---|---|---|
| Curiosidad (`curiosity`) | indifferent · Indiferente | cautious · Prudente | attentive · Atento | curious · Curioso | adventurous · Aventurero |
| Sociabilidad (`sociability`) | solitary · Solitario | reserved · Reservado | friendly · Amistoso | sociable · Sociable | outgoing · Extrovertido |
| Valentía (`bravery`) | fearful · Miedoso | timid · Tímido | steady · Sereno | brave · Valiente | daring · Temerario |
| Afectividad (`affection`) | aloof · Distante | independent · Independiente | warm · Cercano | affectionate · Cariñoso | devoted · Devoto |
| Temperamento (`temper`) | calm · Tranquilo | energetic · Enérgico | lively · Vivaz | restless · Inquieto | impulsive · Impulsivo |

### 2.2 Dónde se guardan
En el JSON existente `Pet.personality`, clave `dims` (sin columna nueva). El mismo JSON guarda
`drift` (topes diarios de evolución), `autonomy` (topes diarios de la vida autónoma),
`lastNeglectDay`, y las claves antiguas `trait`, `temperament` y `genes`. Toda escritura **fusiona**
con lo existente (se corrigió `genes.service.ts`, que antes sobrescribía el JSON entero).

### 2.3 Nacimiento
`rollBirthDims(species.personalityBias, visualSeed)`: sesgo de la especie ± `birth.variance` (15),
con PRNG sembrado → reproducible. Especie sin sesgo → 50 en todo.

### 2.4 Mascotas existentes (migración perezosa)
La primera vez que se lee una mascota sin `dims`, `MindService.ensureDims` las calcula: nacimiento
según su especie y `visualSeed` + empuje según su rasgo antiguo del chat (`traitOf(visualSeed)`:
curious, shy…) y su temperamento de genes. Se guarda y ya no cambia salvo por experiencias. No hace
falta script de datos.

### 2.5 Campos heredados (derivados)
- `trait` (clave de `notifications.json`): valiente | timido | travieso | dulce | curioso | neutral.
- `temperament` (genes/aventura): valiente | timido | arribista | curioso.

Se recalculan cada vez que cambian las dimensiones, así las notificaciones con personalidad y la
aventura narrativa siguen funcionando y además evolucionan.

### 2.6 Influencia
| Dimensión | Conversación | Comportamiento | Vida autónoma | Combate |
|---|---|---|---|---|
| Curiosidad | pregunta, propone explorar | `ask_back`, `propose_explore` | explora, encuentra objetos | — |
| Sociabilidad | habla de amigos | `greet`, `invite_play` | busca Pockai de amigos | — |
| Valentía | anima / busca refugio | `propose_explore`, `sulk` | explora lejos | cura y se protege más tarde |
| Afectividad | cariño explícito o con hechos | `comfort`, `cuddle` | espera al entrenador | — |
| Temperamento | ritmo, emoción | `celebrate`, `invite_play` | juega vs descansa | se protege menos |

---

## 3. Evolution Engine (deriva por experiencias)

Reglas (`balance.json → personality.evolution`):
- **Eventos → deltas** por dimensión (`events`). Ej.: `adventure` +0.6 curiosidad +0.3 valentía;
  `auto_rest_home` −0.1 sociabilidad +0.1 afectividad −0.1 temperamento.
- **Tope diario** por dimensión: 3 puntos (`dailyCapPerDimension`). Ningún día cambia la personalidad
  de golpe.
- **Elasticidad** (0.6): alejarse de 50 se frena cuanto más extremo es el valor; volver hacia el
  centro no se frena. Los rasgos extremos cuestan de ganar.

Fuentes de experiencia (ya existentes, sin tocar sus servicios, vía `@OnEvent`):

| Evento de dominio | Experiencia | Además |
|---|---|---|
| `pet:fed`, `pet:cleaned`, `pet:slept` | fed / cleaned / slept | — |
| `minigame:finished` | minigame | relación con el entrenador +0.05 |
| `battle:finished` | battle_won / battle_lost | recuerdo episódico |
| `chat:message_sent` | chat | — |
| `adventure:finished` (nuevo emit en `AdventureService`) | adventure | el recuerdo lo escribe AdventureService (ahora capa episódica) |
| `habitat:visited` | habitat_visit (ambas mascotas) | episodios + relaciones con el otro entrenador y el otro Pockai |
| `coop:friendship_accepted` | friend_made | — |
| Conversación (orquestador) | talk_comfort / talk_play / talk_scold | ver §6 |
| Vida autónoma | auto_explore / auto_socialize / auto_rest_home / auto_wait_owner / auto_find_item | ver §5 |
| Un día entero sin el entrenador | neglect_day (una vez al día) | −afectividad, −sociabilidad |

---

## 4. Memory Engine (3 capas)

### 4.1 Capas
| Capa | Qué guarda | Ejemplo | Vida media |
|---|---|---|---|
| **episodic** | Acontecimientos concretos, fechados | «Visité el hábitat de Ana y jugué con Brasa. Me lo pasé bien.» | 7 días |
| **semantic** | Lo aprendido del entrenador y del mundo | «A mi entrenador le gusta el café.» / hábitos de escritorio | 60 días |
| **emotional** | Valoración simulada de relaciones, una fila por sujeto | «Brasa (Pockai de Ana)» con valencia +0.45 | 30 días |

Sujetos de la memoria emocional: `owner` (clave `emo:owner`), otros entrenadores (`emo:user:<id>`),
otros Pockai (`emo:pet:<id>`). La valencia (−1..1) se mueve con media móvil (`nextValence`) y la
importancia crece con la familiaridad.

### 4.2 Modelo de datos
`PetMemory` gana columnas: `layer`, `importance` (0–1), `valence` (−1..1), `subject`,
`lastRecalledAt`, `updatedAt` (migración `20261118000000_pockai_mind`). Los recuerdos existentes se
reclasifican: `summary` → episodic, `fact`/`habit` → semantic.

### 4.3 Capacidad y olvido
Capacidad = `balance.personality.memory.capacity[tier] × planMultiplier[plan]`:

| Nivel de inteligencia | episodic | semantic | emotional |
|---|---|---|---|
| chat (< 200) | 15 | 10 | 8 |
| memory (200–499) | 40 | 40 | 20 |
| agent (≥ 500) | 80 | 60 | 40 |

(×2 en plan pro.) Al superar la capacidad se olvida lo de menor **retención**:
`importancia × 0.5^(días desde el último uso / vida media)` (+ |valencia|·0.2 en emocional).
Recordar algo en un prompt actualiza `lastRecalledAt` y lo refuerza. Nunca se olvidan solos la
relación con el entrenador ni el último resumen (marca de «procesado hasta» de la extracción).

### 4.4 Selección para cada interacción
El LLM **no** recibe la conversación completa ni toda la memoria. `selectForPrompt` puntúa cada
recuerdo = palabras compartidas con el mensaje + retención (+1 a la relación con el entrenador),
toma como máximo 4 episodios, 6 conocimientos y 3 relaciones, y corta en el **presupuesto de
caracteres del plan** (`promptBudgetChars`: free 700, pro/BYOK 1400). Los recuerdos se envuelven en
`<recuerdos>` y se marcan como datos, nunca instrucciones.

### 4.5 Seguridad de la memoria
- Todo texto pasa por `cleanText` + filtro de sensibles (`isSensitive`: claves, contraseñas,
  números largos, inyecciones de prompt) antes de guardarse.
- El Conversation Engine **no guarda el texto literal** del usuario: guarda una paráfrasis de
  plantilla («Mi entrenador me contó que estaba teniendo un mal día…»).
- La extracción por LLM de hechos y resúmenes (ya existente) sigue igual: requiere inteligencia ≥ 200,
  respeta cuotas y presupuesto.
- `GET /pets/:id/memories` devuelve también `layer`, `importance`, `valence`, `subject`; se puede
  borrar cada recuerdo o todos (sin cambios en esos endpoints).

---

## 5. Vida autónoma

### 5.1 Principio: nada se ejecuta permanentemente
No hay una IA ni un proceso por criatura. El tiempo se divide en intervalos de 60 min con índice
absoluto (`epoch / intervalo`). Cada mascota guarda `Pet.autonomyCursor` (último intervalo
simulado). Coste: unas pocas consultas cuando alguien abre la app; **cero llamadas al LLM**.

### 5.2 Simulación perezosa (`AutonomyService.catchUp`)
Se ejecuta en `PetsService.getPetById` y en `getPets` (los clientes cargan la lista al abrir), justo
después del lazy tick de vitales:
1. Intervalos pendientes = desde el cursor (o desde que el entrenador se fue + 30 min) hasta el
   último intervalo completo; máximo 24 por lectura.
2. **Reclamo atómico** del rango (`updateMany` condicionado al cursor anterior): si dos lecturas
   compiten, solo una simula. La primera lectura de una mascota solo inicializa el cursor.
3. Cada intervalo usa un PRNG sembrado con `(petId, índice)` → **determinista**: releer no da
   objetos nuevos (anti-farmeo).
4. Actividad elegida por pesos de personalidad (`balance.personality.autonomy.activities`):
   `rest`, `play_alone`, `explore`, `socialize`, `wait_owner`. Sin energía o enfermo → descansa.
   Dormido → solo recuerda que durmió (la energía la recupera el lazy tick; no se cuenta dos veces).
5. Efectos con topes diarios: energía al descansar (≤ 30/día), felicidad (≤ 12/día), objetos al
   explorar (prob. 15 % + bonus por curiosidad, ≤ 2/día, de `itemFind.items`), encuentros con
   mascotas de amigos (≤ 3/día).
6. Lo memorable se guarda como episodios **fechados en su intervalo** (así el LLM puede decir
   «ayer…»), máximo 6 por tanda (los más importantes). Los encuentros los recuerdan **las dos**
   mascotas, con su relación emocional.
7. Deriva de personalidad por las actividades y, si ha pasado un día entero sin el entrenador,
   `neglect_day`.

### 5.3 Barrido social (`AutonomyService.socialSweep`, cron `0 */2 * * *`)
Con `CronLockService` (una réplica a la vez), recorre paginado las amistades aceptadas
(`CoopFriendship`), máx. 500 por barrido. Si ninguno de los dos entrenadores está (sin interacción
en 30 min) y ambas mascotas están despiertas y sanas, tira un encuentro determinista
`(pareja, ranura de 2 h)` con probabilidad 35 % × factor de sociabilidad de ambas (0.5–1.5).
Solo entre amigos, nunca desconocidos.

### 5.4 Cómo lo ve el usuario
- `GET /pets/:id/mind` → `recentLife`: últimos 10 episodios autónomos/encuentros.
- En el chat: los episodios entran como recuerdos y la mascota los narra con su personalidad
  («Ayer fui a ver a Brasa, ¡me lo pasé genial!»), sin llamada extra al LLM.

---

## 6. Orquestador de IA (flujo de una conversación)

```
Entrada del usuario
  └─ Filtros previos (ChatService.prepare): longitud (1000 / plan), rate limit por minuto,
     moderación de entrada, muro de pago y cuota diaria (gestionada), presupuesto global,
     reserva de coste, cuota mensual de tokens, un stream a la vez por usuario
  └─ AI Orchestrator (buildContext + planTurn)
       ├─ Conversation Engine: interpretMessage → intención, sentimiento, episodio
       ├─ Personality Engine: perfil + bloque de personalidad
       ├─ Behavior Engine: decideBehavior → reacción (acción + animación) → pista al prompt
       └─ Memory Engine: recallBlock → recuerdos relevantes dentro del presupuesto del plan
  └─ LLM (streaming): redacta la respuesta; en nivel agente puede proponer una acción
     estructurada con la herramienta `express_behavior` (además de las herramientas existentes). Se
     ofrece una vez por turno; si el modelo ya respondió con texto, proponer la reacción NO provoca
     otra llamada al proveedor (sin coste ni texto duplicado)
  └─ Validación de reglas de juego
       ├─ express_behavior → validateBehavior: catálogo cerrado, estado (dormido, enfermo, sin
       │   energía), coherencia con la personalidad; si no pasa, se sustituye y se le dice al LLM
       └─ herramientas con efectos → tarjeta de confirmación (PendingAction, ya existente)
  └─ Moderación de salida en streaming (OutputGuard)
  └─ Game engine (afterTurn, en segundo plano para no retrasar la respuesta): efectos acotados
     (felicidad +1/+2), deriva de personalidad
  └─ Respuesta + animación + memoria
       ├─ evento `done` del stream incluye `behavior: { action, animation, emote }`
       └─ episodio si merece la pena (mal día, buena noticia, cariño, regañina) + relación con el
          entrenador según el sentimiento, solo en mensajes significativos (con episodio o
          |sentimiento| ≥ 0.5): un saludo o una charla neutra no crean ni mueven recuerdos
```

### 6.1 Ejemplo: «Hoy he tenido un día bastante malo»
1. Conversation Engine → `sad_day`, sentimiento −0.7, episodio memorable.
2. Memory Engine → p. ej. «(ayer) Jugamos al minijuego de reflejos» y «Mi entrenador (le tienes
   muchísimo cariño)».
3. Personality Engine → criatura cariñosa (afectividad 78) pero vivaz (temperamento 55).
4. Behavior Engine → `comfort` (animación `idle` + emote `heart`); pista: «Consuela a tu entrenador
   con calidez y dile que estás a su lado».
5. LLM → «No sé muy bien qué ha pasado, pero puedes quedarte conmigo. Podemos jugar un rato si quieres».
6. Game engine → felicidad +1, `talk_comfort` (+afectividad).
7. Memory Engine → episodio «Mi entrenador me contó que estaba teniendo un mal día y estuve a su lado»
   y relación con el entrenador ligeramente reforzada.

Una criatura distante e impulsiva, con la misma frase, elegiría `invite_play`: la respuesta depende
de la personalidad y de la relación construida.

### 6.2 Por qué el LLM no devuelve JSON libre
La respuesta se transmite en streaming y se modera mientras llega; el plan free tiene 120 tokens de
salida; y el modo Hermes local devuelve solo texto. Por eso la **acción estructurada** viaja por el
canal de herramientas (validado) y, cuando no hay herramientas (niveles charla/memoria, plan sin
agente, modo local), la decide el Behavior Engine por reglas. En todos los casos la acción final
pasa por `validateBehavior` antes de aplicarse.

### 6.3 Guardrails y límites (resumen)
| Capa | Mecanismo |
|---|---|
| Entrada | máx. 1000 caracteres (o `maxInputChars` del plan), caracteres de control eliminados, moderación |
| Frecuencia | rate limit por minuto (Redis), un stream por usuario |
| Coste | muro de pago/plan, cuota diaria de mensajes, presupuesto global, reserva y liquidación de coste, cuota mensual de tokens, `maxOutputTokens` del plan |
| Prompt | historial y memoria con presupuesto de caracteres por plan; recuerdos marcados como datos |
| Acciones | catálogo cerrado, validación de estado/coherencia, confirmación para efectos reales |
| Salida | moderación en streaming; el razonamiento se modera aparte |
| Memoria | filtro de sensibles, paráfrasis en lugar de texto literal, borrado por el usuario |

---

## 7. Combate
`Fighter.personality = { heal, guard }` se calcula en `BattlesService.fighterFromPet` con
`combatBias(dims)` y queda **congelado en la instantánea** del combate. El sesgo también se guarda
en el participante del log (`ParticipantLog.personality`) para que la repetición sea reproducible
desde el propio log; sin personalidad (bots), el log no cambia. En `chooseSkill` desplaza los
umbrales de curar y protegerse (±5 % como mucho): valentía alta → cura y se protege más tarde;
temperamento alto → se protege menos. La estrategia agresiva sigue sin protegerse nunca.
No añade ninguna llamada al PRNG: un luchador sin personalidad (bots) produce exactamente el mismo
combate que antes (los tests de combate y simulación pasan sin cambios). Raid, torneo y devkit
construyen sus luchadores aparte y, de momento, no aplican el sesgo.

---

## 8. Datos y configuración
- `shared/game-data/balance.json → personality`: dimensiones/bandas/keywords/prompts, nacimiento,
  evolución, memoria, vida autónoma, combate, comportamiento. Validado por `scripts/validate-game-data.js`
  (bandas contiguas hasta 100, keywords únicas, dimensiones válidas, objetos existentes).
- `shared/game-data/species.json → personalityBias` (opcional en el esquema Zod; obligatorio en especies
  nuevas según la skill). Valores actuales: ignisaur 60/55/65/45/65, axolunar 45/50/40/65/20,
  florabud 65/60/35/60/35.
- Migración `backend/prisma/migrations/20261118000000_pockai_mind`.

## 9. API
- `GET /pets/:id/mind` (nuevo): dimensiones con valor/keyword/etiqueta, campos heredados, ánimo,
  vínculo, nivel de inteligencia, recuerdos por capa y capacidad, vida autónoma reciente.
- `POST` de chat (SSE): el evento `done` añade `behavior` (opcional).
- `POST` sync del modo local: la respuesta añade `behavior`.
- `GET /pets/:id/memories`: cada recuerdo añade `layer`, `importance`, `valence`, `subject`.

## 10. Skill `pockai-architect`
Actualizada para diseñar el `personalityBias` de cada especie nueva: nueva referencia
`references/personality.md` (dimensiones, keywords, reglas de diseño), campo en `schema.md`, sección
de personalidad en la plantilla de ficha (incluye cómo puede evolucionar y su vida autónoma típica),
paso en el checklist y comprobaciones en `check_species.mjs` (enteros en [15, 85], perfil no plano,
distancia con otras especies).

## 11. Tests
`backend/src/modules/ai/chat.service.spec.ts` (3 tests nuevos): texto + `express_behavior` hace una
sola llamada al proveedor y la reacción se valida (sin energía → `yawn`); una acción fuera de
catálogo se rechaza y no llega al agente; tras responder se registran episodio, relación y deriva.

`backend/src/modules/mind/mind.engines.spec.ts` (22 tests): keywords por rango, nacimiento
determinista, migración de rasgos antiguos, derivación de campos heredados sin perder genes,
sesgo de combate acotado, topes y elasticidad de la deriva, divergencia A/B, capacidad × plan,
olvido, selección por relevancia y presupuesto, filtro de sensibles, interpretación sin texto
literal, reacciones distintas según personalidad, validación de reglas, determinismo y topes de la
vida autónoma, influencia de la personalidad en las actividades, encuentros sociales.
Siguen pasando los suites de ai, battles, genes, hatching, pets, game-data y adventure.

## 12. Pendiente (fases siguientes)
- **Clientes** (escritorio, Android, web): pantalla de personalidad (5 barras con keyword), memoria
  por capas, diario de vida autónoma, y animar `behavior` del evento `done` (las animaciones usan
  los sprites existentes `idle`/`happy`/`sleep`; los emotes son nuevos para la burbuja).
- Emitir `behavior` también por WebSocket (`pet:action`): requiere añadir la acción a
  `PET_ACTIONS` y a `desktop/src/lib/animation/petActions.ts` a la vez.
- Integrar los episodios autónomos en el diario de ausencia (feature 028, `DiaryService`).
- Consolidación episódico → semántico (p. ej. «suelo jugar con Brasa» tras varios encuentros).
- Herencia de dimensiones en breeding (media de los padres + variación); hoy la cría las obtiene
  de forma perezosa desde su especie.
- Sesgo de personalidad en raid y torneo.
- Variantes evolutivas según personalidad dominante (descartado en esta fase: requiere arte).
- Aplicar la migración en cada entorno (`prisma migrate deploy`). **No se ha ejecutado contra una
  BD real** en este cambio (Docker no disponible); se comprobó que su DDL coincide con el que genera
  `prisma migrate diff` desde el esquema anterior.
- **Verificación de extremo a extremo pendiente**: arrancar el backend con BD, llamar a
  `GET /pets/:id/mind`, enviar un mensaje de chat y comprobar `behavior` en `done`, y simular una
  ausencia para ver la vida autónoma. El grafo de módulos Nest sí arranca (lo usa
  `export:openapi`), pero las inyecciones nuevas son `@Optional()`: un fallo de cableado apagaría la
  función en silencio en vez de romper el arranque.
