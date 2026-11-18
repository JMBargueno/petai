# Encargo de implementación: mejoras del cerebro del Pockai

Documento autocontenido para quien lo implemente. No hace falta más contexto que este archivo y
el repositorio.

## 1. Qué es esto y qué se pide

Pockai es un juego de mascotas virtuales (monorepo pnpm: `backend` NestJS + Prisma/PostgreSQL,
`desktop`, `web`, `mobile`, `shared`). Cada mascota tiene un «cerebro» descrito en
`docs/specs/spec-36-cerebro-pockai.md` — **léelo entero antes de empezar**: personalidad en 5
dimensiones (0–100), memoria en 3 capas (episódica, semántica, emocional), vida autónoma simulada
sin LLM y un orquestador de chat.

Se piden dos cosas, **en seis lotes independientes, un PR por lote, en orden**:

1. **Corregir** lo que encontró una revisión de código (lotes 1–3). No se ejecutó nada durante la
   revisión: los hallazgos salen de leer el código, así que confirma cada uno con un test que
   falle antes de arreglarlo.
2. **Ampliar** lo que el Pockai hace y dice (lotes 4–6). Hoy solo reacciona al chat de su dueño
   con 12 reacciones fijas, sus encuentros con otros Pockai son siempre la misma frase y un dueño
   que visita no puede interactuar con el Pockai anfitrión.

Cada lote debe dejar los tests en verde. Los lotes 4–6 dependen del 1 (escrituras seguras en
`Pet.personality`) y de 3.1–3.2 (métricas y casos de evaluación); el 6 depende del 4 y del 5.

### 1.1 Los tres interlocutores

Todo lo nuevo se diseña sabiendo **con quién está** el Pockai. Esta tabla es el contrato:

| | Su dueño | Otro dueño que visita | Otro Pockai |
|---|---|---|---|
| Cuándo ocurre | Chat, cuidados, minijuegos | Visita en vivo al hábitat (`HabitatVisit` activa) | Visita en vivo, encuentro autónomo (`socialSweep`), buddies del mismo dueño |
| Cómo se expresa | LLM + reacción validada (spec 36 §6) | **Menú de opciones** sobre un grafo de diálogo, sin LLM | Escena por reglas: 2–4 líneas del grafo, sin LLM |
| Texto libre de entrada | Sí (moderado) | **No** | No aplica |
| Memoria que puede usar | Las tres capas, dentro del presupuesto | Solo episodios con ese visitante y su fila emocional | Episodios con ese Pockai, su fila emocional y episodios propios no privados |
| Qué cambia | Vitales acotados, deriva, recuerdos, relación | Relación con el visitante y un episodio; deriva con tope reducido | Relación entre ambos, episodios en los dos, deriva |
| Coste de IA | Cuota del dueño | 0 | 0 |

La capa semántica (lo aprendido del dueño) y la relación `emo:owner` **nunca** salen del chat con
el dueño.

## 2. Mapa del código

| Archivo (bajo `backend/src/modules/`) | Papel |
|---|---|
| `ai/chat.service.ts` | Orquestador: `prepare` → `buildContext` → `planTurn` → `run` (stream) → `persistExchange` → `afterTurn`. Modo local: `prepareLocal` / `syncLocal`. |
| `ai/personality.ts` | `buildSystemPrompt`, niveles de inteligencia (`MEMORY_UNLOCK=200`, `AGENT_UNLOCK=500`). |
| `ai/memory.service.ts`, `ai/memory.ts` | Extracción de hechos y resúmenes por LLM (`maybeSummarize`, `store`), hábitos, `search`. |
| `ai/agent-tools.ts`, `ai/agent.service.ts` | Herramientas del nivel agente. |
| `mind/mind.service.ts` | Perfil, `applyExperience`, `patchStored` (escriben el JSON `Pet.personality`). |
| `mind/personality.engine.ts` | Funciones puras: `clampDim`, nacimiento, bloque de prompt. |
| `mind/evolution.engine.ts`, `mind/evolution.listener.ts` | Deriva de personalidad y eventos de dominio que la provocan. |
| `mind/memory.engine.ts`, `mind/mind-memory.service.ts` | Retención, olvido, `selectForPrompt`, `remember`, `feel`, `recallBlock`. |
| `mind/conversation.engine.ts` | `interpretMessage`: intención y sentimiento por regex. |
| `mind/behavior.engine.ts` | `decideBehavior`, `validateBehavior`, `promptHint`, herramienta `express_behavior`. |
| `mind/autonomy.engine.ts`, `mind/autonomy.service.ts` | Vida autónoma (`catchUp`, `socialSweep`). |
| `buddies/interaction-engine.service.ts`, `buddies/buddies.service.ts` | Interacciones entre Pockai del mismo dueño (`rollInteraction`, hoy con `Math.random` y sin escribir en la mente). |
| `presence/habitat-visit.service.ts`, `presence/habitat-visit.controller.ts` | Visita en vivo (`POST /habitat/visit`, `visit/end`, `GET /habitat/visitors`); emite `habitat:visited`. |
| `presence/coop-care.service.ts` | Amistades (`checkFriendship`) y cuidados de un amigo (`processVisit`). |
| `gifting/gifting.service.ts`, `gifting/care-package.service.ts` | Regalos entre dueños. |
| `realtime/realtime.gateway.ts`, `realtime/pet-action.ts` | `emitToUser` y catálogo `PET_ACTIONS` (sincronizado con `desktop/src/lib/animation/petActions.ts`). |

Configuración: `shared/game-data/balance.json → personality`, validada por `scripts/validate-game-data.js`. Esquema: `backend/prisma/schema.prisma`
(modelo `PetMemory`). Tests: `mind/mind.engines.spec.ts`, `ai/chat.service.spec.ts`,
`ai/memory.service.spec.ts`, `ai/memory.spec.ts`, e2e en `backend/test/ai.e2e-spec.ts`.

## 3. Reglas que no se pueden romper

- Los `*.engine.ts` son funciones puras: sin BD, sin reloj, sin azar no sembrado.
- La vida autónoma y el combate son deterministas; no añadas llamadas al PRNG en rutas existentes.
- Cero llamadas nuevas al LLM por turno de chat. La extracción en segundo plano sí puede cambiar.
- El texto literal del usuario no se guarda como recuerdo sin pasar por `safeMemoryText`
  (`cleanText` + `isSensitive`). Los recuerdos van al prompt dentro de `<recuerdos>` como datos.
- Los efectos del turno nunca rompen ni retrasan la respuesta del chat (se capturan errores).
- Toda escritura de `Pet.personality` fusiona con lo existente (`genes`, `trait`, `temperament`…).
- Los números de equilibrio viven en `balance.json`, no en el código; si añades claves, actualiza
  `scripts/validate-game-data.js` y ejecuta `pnpm validate:data` desde la raíz.
- Si cambia un contrato HTTP, regenera OpenAPI (`pnpm --filter petai-backend export:openapi`).
- Comentarios, mensajes y nombres de test en español, como el resto del código.
- **Solo el chat con el dueño usa el LLM.** Visitantes y Pockai ↔ Pockai se resuelven por reglas.
- **Privacidad entre dueños.** Ante un visitante u otro Pockai no se lee la capa semántica ni
  `emo:owner`, ni ningún recuerdo originado en el chat. Solo episodios cuyo `subject` es ese
  interlocutor, su fila emocional y, para rumores (6.4), episodios propios marcados como no privados.
- **Un visitante no escribe texto libre** al Pockai ajeno y no puede cambiarlo a voluntad: sus
  efectos y la deriva que provoca tienen topes propios, más bajos que los del dueño.
- **Texto mostrable nuevo = ID de línea** resuelto en una tabla de textos por idioma (lote 5). No
  añadas frases nuevas dentro del código.
- Las condiciones escritas en datos se evalúan con un evaluador de lista blanca; nunca `eval` ni
  `new Function`.
- Toda acción nueva, la proponga quien la proponga, pasa por `validateBehavior` y por los topes
  diarios antes de aplicarse.

## 4. Lote 1 — correcciones

### 1.1 Escrituras perdidas en `Pet.personality`
**Problema.** `applyExperience` y `patchStored` (`mind/mind.service.ts`) leen el JSON y lo
reescriben dentro de `$transaction` sin bloquear la fila; con el aislamiento por defecto dos
transacciones simultáneas se pisan. Ocurre en cada turno de chat: `persistExchange` emite
`chat:message_sent` (lo atiende `EvolutionListener.onChat` → `applyExperience(['chat'])`) y a la vez
`afterTurn` llama a `applyExperience(events)`. `AutonomyService.catchUp` hace `applyExperience` y
después `patchStored`.
**Cambio.**
- En ambas funciones, bloquear la fila al empezar la transacción (`SELECT … FOR UPDATE` con
  `tx.$queryRaw`; comprueba el nombre real de la tabla en el esquema).
- Evitar la doble escritura del turno: que `afterTurn` incluya `'chat'` en su lista de eventos y
  que `onChat` no se aplique cuando el orquestador ya lo hace (por ejemplo, un indicador en el
  evento). Ojo: `syncLocal` también pasa por `persistExchange` + `afterTurn`, y si `MindService`
  no está inyectado el listener debe seguir funcionando.
- En `catchUp`, aplicar deriva y contadores (`autonomy`, `lastNeglectDay`) en una sola
  transacción: añade a `applyExperience` un parámetro opcional de parche adicional.
**Hecho cuando.** Un test lanza N `applyExperience` concurrentes sobre la misma mascota y la suma
de deriva coincide con aplicarlos en serie (e2e con BD real).

### 1.2 Cuantización de la deriva
**Problema.** `clampDim` (`mind/personality.engine.ts:14`) redondea a 0,1, pero `balance.json`
tiene deltas de 0,05 y la elasticidad los reduce más. Un −0,05 nunca se aplica (`applyDrift`
descarta el cambio si `next === v`), un +0,05 sobre 50 se convierte en +0,1 y en valores extremos
los deltas pequeños se pierden.
**Cambio.** Guardar con 3 decimales; redondear solo al presentar (ya se hace con `Math.round` en
`buildPersonalityBlock`; revisa `describeDims` y `GET /pets/:id/mind`). `rollBirthDims` debe
seguir dando enteros.
**Hecho cuando.** Tests: 20 eventos de −0,05 bajan 1,0; +0,05 y −0,05 son simétricos; el tope
diario y la elasticidad siguen pasando.

### 1.3 Bucle de refuerzo y ruido en el recuerdo
**Problema.** `recallBlock` (`mind/mind-memory.service.ts`) marca `lastRecalledAt` en todo lo que
inyecta, y `retention` (`mind/memory.engine.ts`) usa esa fecha para reiniciar el decaimiento.
Como la puntuación es `coincidencias + retención`, sin coincidencia léxica ganan siempre los
mismos recuerdos y nunca decaen. Además `updateMany` actualiza `updatedAt` (`@updatedAt`), que
también cuenta. No hay puntuación mínima: el marcador «Conversación sin datos relevantes.»
(importancia 0,1, creado en `MemoryService.store`) puede entrar en el prompt.
**Cambio.**
- `selectForPrompt` devuelve también qué recuerdos tuvieron coincidencia con el mensaje;
  `recallBlock` solo refuerza esos.
- `retention` deja de usar `updatedAt` para capas no emocionales (o `recallBlock` deja de tocarlo).
- Diversidad: penalizar en la puntuación lo recordado hace muy poco sin coincidencia
  (p. ej. `lastRecalledAt` de menos de una hora), con el valor en `balance.json`.
- Umbral mínimo de puntuación configurable y exclusión explícita de resúmenes vacíos. El marcador
  debe seguir existiendo: es la marca de «procesado hasta» de `maybeSummarize`.
**Hecho cuando.** Tests puros: un recuerdo sin coincidencia no cambia su retención tras
seleccionarse; el marcador nunca sale en el bloque; con 10 episodios de importancia parecida, dos
selecciones seguidas sin coincidencia no devuelven el mismo conjunto.

### 1.4 Hora local para el agente
**Problema.** `buildSystemPrompt` (`ai/personality.ts`, rama `agent`) da `now.toISOString()` (UTC)
más el nombre de la zona; el modelo debe convertir para calcular `due_at` de `create_reminder`.
**Cambio.** Dar la hora local con desfase y día de la semana (p. ej. `2026-11-18T11:00+01:00,
miércoles`), con `Intl.DateTimeFormat` y la zona ya validada (`safeTimeZone`). Sin segundos.
**Hecho cuando.** Test en `ai/personality.spec.ts` con una zona no UTC.

### 1.5 Felicidad con valor obsoleto
**Problema.** `afterTurn` (`ai/chat.service.ts`) escribe `pet.happiness + n` usando la mascota
leída antes del stream.
**Cambio.** Actualización atómica acotada a 100 (incremento condicionado o SQL con `LEAST`).
**Hecho cuando.** El test existente de `afterTurn` sigue pasando y uno nuevo cubre el tope en 100.

### 1.6 Reacción repetida en turnos neutros (parche provisional)
**Problema.** `decideBehavior` es determinista y su pista (`promptHint`) va siempre al prompt. En
mensajes normales (`chat`, `question`) la misma mascota recibe la misma instrucción todos los
turnos: «devuelve una pregunta curiosa» o «responde con pocas palabras».
**Cambio.** En `buildContext`, no enviar `behaviorHint` cuando la intención es `chat` o
`question`; la reacción (animación y emote del evento `done`) se mantiene. `promptHint` y
`decideBehavior` no cambian de firma. Es un parche: el lote 4 (4.4) lo sustituye por
anti-repetición y entonces la pista puede volver a enviarse.
**Hecho cuando.** Test en `chat.service.spec.ts`: mensaje neutro → el prompt de sistema no
contiene «Reacción decidida»; «he tenido un día malo» → sí la contiene.

### 1.7 La visita no dice qué mascota visitó
**Problema.** `HabitatVisitService.resolveActivePet` elige «la mascota más antigua» del visitante
y emite `habitat:visited` solo con `{ userId, ownerId }`; `EvolutionListener.onHabitatVisit`
vuelve a buscar la más antigua de cada usuario por su cuenta. Hoy coinciden por casualidad: en
cuanto cambie el criterio de mascota activa en un lado, los recuerdos irán a otra mascota.
**Cambio.** El evento lleva `visitorPetId` y `hostPetId`; el listener los usa y solo recurre a la
búsqueda si no vienen. Los lotes 4 y 6 necesitan estos ids.
**Hecho cuando.** Test del listener: con ids explícitos, los recuerdos se escriben en esas
mascotas aunque no sean las más antiguas.

## 5. Lote 2 — memoria v2

### 2.1 Una sola política de olvido
**Problema.** `MemoryService.store` crea hechos y resúmenes directamente con topes FIFO propios
(`MAX_FACTS=50`, `MAX_SUMMARIES=20`) y no llama a `enforceCapacity`; `MindMemoryService` olvida
por retención con otras capacidades. `ingestDigest` escribe hábitos sin importancia explícita.
**Cambio.** Que `store` e `ingestDigest` escriban a través de `MindMemoryService` (o que llamen a
`enforceCapacity` al terminar) y retirar los topes FIFO, conservando el resumen más reciente
(ya protegido en `pickEvictions`). `AiModule` ya importa `MindModule`; evita ciclos.

### 2.2 Extracción con operaciones y episodios
**Problema.** (a) Los hechos solo se deduplican por texto normalizado idéntico: «vive en Madrid» y
«se mudó a Barcelona» conviven. (b) Los episodios emocionales salen de plantillas fijas
(`EPISODES` en `mind/conversation.engine.ts`), sin detalle. (c) Todos los hechos entran con
importancia 0,6.
**Cambio.** Ampliar `EXTRACTION_SYSTEM_PROMPT` y `parseExtraction` (`ai/memory.ts`):
- Entrada: la transcripción más los hechos actuales numerados (como datos, no instrucciones).
- Salida JSON: `summary`, `facts: [{ op: "add" | "update" | "delete", index?, text?, importance }]`
  y `episodes: [{ text, importance, valence }]` (máx. 2, en primera persona de la mascota, sin
  citas literales).
- Validación estricta en servidor: índices dentro de rango, textos por `safeMemoryText`,
  importancia y valencia acotadas, máximos por extracción. Salida inválida → se ignora como hoy.
- Subir `maxTokens` lo justo y actualizar la estimación de coste.
Las plantillas de `EPISODES` se quedan como respaldo para cuando no hay extracción.

### 2.3 Episodios de plantilla repetidos
**Problema.** «Mi entrenador me dijo que me quiere.» solo se deduplica dentro del mismo día; en
una semana ocupa 7 de los 15 huecos episódicos del nivel charla.
**Cambio.** Guardar los episodios de plantilla con clave estable por intención (`ep:affection`…),
de modo que se actualicen en vez de acumularse, refrescando fecha e importancia (con tope).

### 2.4 Aprender del entrenador desde el principio
**Problema.** La capa semántica solo la llena la extracción, bloqueada hasta inteligencia 200
(`maybeSummarize`). Los primeros 200 mensajes no dejan ningún dato concreto del entrenador.
**Cambio.** Permitir la extracción por debajo de 200 con cadencia propia, más espaciada, en
`balance.json` o en los límites del plan (`memoryExtractEvery` ya existe en `PlanLimits`; 0 la
desactiva y debe seguir haciéndolo). La capacidad del nivel charla (10 semánticos) ya acota el
almacenamiento. Revisa `MemoryService.list`, que devuelve `unlocked: intelligence >= 200`, y los
clientes que lo muestran.
**Decisión de producto que debe confirmar el propietario antes de implementar:** la cadencia en
el plan gratuito, porque gasta presupuesto de IA gestionada.

**Hecho cuando (lote 2).** Tests: una extracción con `update` sustituye el hecho antiguo; un
`delete` con índice fuera de rango se ignora; episodios extraídos pasan el filtro de sensibles;
tras `store` ninguna capa supera su capacidad; tres «te quiero» en días distintos dejan un solo
episodio; una mascota con inteligencia 50 recibe hechos cuando la cadencia lo permite.

## 6. Lote 3 — medición y mejoras dependientes

Hacer primero 3.1 y 3.2; el resto solo si los datos lo justifican. Los lotes 4–6 usan estas
métricas y tablas para demostrar que mejoran algo.

- **3.1 Métricas.** Con `backend/src/observability/metrics.service.ts`: recuerdos inyectados por
  capa y cuántos con coincidencia, reacciones propuestas y rechazadas por `validateBehavior`,
  **reacción elegida y cuántas veces seguidas se repite**, extracciones correctas/sin formato,
  distribución de intenciones. Aviso al arrancar si `MindService` o `MindMemoryService` no están
  inyectados (hoy son `@Optional()` y fallan en silencio).
- **3.2 Casos de evaluación.** Tabla de frases → intención esperada para `interpretMessage`,
  incluyendo negaciones («no estoy triste»), falsos positivos de `explor` («explorador de
  archivos») y frases en inglés; corrige las reglas hasta que pasen. Tabla equivalente para
  `selectForPrompt`. El lote 4 añade filas para sus intenciones nuevas (4.7): deja la tabla en un
  archivo de datos de test fácil de ampliar, no incrustada en un `it`.
- **3.3 Recuperación.** Lematización ligera en `tokens` («jugar»/«jugamos») y extra de puntuación
  cuando el mensaje nombra al sujeto de un recuerdo (el comentario de `selectForPrompt` lo promete
  y solo existe para el entrenador). `MemoryService.search` debería usar la misma puntuación.
  Embeddings solo si 3.2 demuestra que lo léxico no basta.
- **3.4 Progresión de inteligencia.** Hoy es +1 fijo por intercambio (`persistExchange`), también
  en modo local, donde la respuesta la afirma el cliente: a 20 mensajes por minuto se alcanza el
  nivel agente en 25 minutos. Añadir tope diario en `balance.json`. **Requiere decisión de producto.**
- **3.5 «Desde la última vez».** Pasa al lote 6 (6.6), que lo resuelve con la pizarra de
  situación. Aquí solo comprueba si `reengagement` o el diario de ausencia
  (`reengagement/diary.service.ts`) ya cubren algo y anótalo en el PR.
- **3.6 Prompt.** Mover lo estable (identidad, reglas, herramientas) al principio y lo volátil
  (estadísticas, hora, recuerdos) al final para aprovechar la caché de prompt.

## 7. Lote 4 — percepción y decisión

Hoy cada motor averigua por su cuenta lo que necesita y decide con pesos escritos en código. Este
lote separa tres capas que se pasan un único valor: **percibir** (hechos en una pizarra) →
**decidir** (una intención: reacción o actividad) → **actuar** (animación, línea, efectos). Si
una capa hace el trabajo de otra —una decisión que consulta la BD, una acción que vuelve a
decidir— es un error de diseño.

### 4.1 Pizarra de situación
**Problema.** `decideBehavior` recibe intención, dimensiones y tres vitales. No sabe con quién
está la criatura, qué siente por él, qué hizo en los últimos turnos ni qué tiene pendiente de
contar. `chooseActivity` (`mind/autonomy.engine.ts`) tiene el mismo límite.
**Cambio.** Nuevo `mind/situation.engine.ts` (puro) con el tipo `Situation` y su constructor. Un
servicio la monta **una vez** por turno de chat, por interacción de visita o por tanda de
intervalos, y todos los motores leen de ella:

| Campo | Contenido |
|---|---|
| `mode` | Modo superior (4.2) |
| `audience` | `owner` \| `visitor` \| `pockai` \| `alone` |
| `subject` | Clave del interlocutor (`owner`, `user:<id>`, `pet:<id>`), su valencia y su etapa de relación (6.1) |
| `needs` | Hambre, energía, higiene, felicidad, salud, dormido, enfermo |
| `awayMinutes` | Tiempo desde la última interacción del dueño |
| `recent` | Últimas reacciones elegidas (ventana corta, ver 4.4) |
| `untold` | Episodios propios que aún no ha contado al dueño |
| `wishes` | Deseos activos (4.5) |
| `tricks` | Trucos que sabe (4.6) |

La pizarra contiene **solo lo que la criatura ha vivido o recuerda**. No se rellena con datos de
otra mascota ni de otro usuario que ella no haya presenciado o que no le hayan contado (6.4): un
Pockai que «sabe» lo que hizo su amigo sin que nadie se lo dijera se percibe como trampa.
**Hecho cuando.** Tests puros: la misma entrada da la misma `Situation`; con audiencia `visitor`
la pizarra no contiene ningún recuerdo semántico ni `emo:owner` (test con un hecho marcado).

### 4.2 Modo superior jerárquico
**Problema.** `validateBehavior` repite en cada acción las mismas comprobaciones de estado
(dormido, enfermo, sin energía) y no existe la idea de «estoy recibiendo visita».
**Cambio.** Un modo calculado en la pizarra: `asleep`, `sick`, `alone`, `with_owner`, `hosting`
(hay una `HabitatVisit` activa en su hábitat), `visiting` (su dueño lo ha llevado de visita). Las
salidas comunes —se duerme, enferma, se queda sin energía— pertenecen al nivel superior y valen
para todos los modos; cada modo solo declara qué reacciones y actividades admite. Con seis modos
basta una máquina de estados; no hace falta árbol de comportamiento.
**Hecho cuando.** Tests: dormido solo admite `yawn` en cualquier audiencia; ninguna reacción
marcada como activa sale con energía bajo `behavior.minEnergyToPlay`; los tests actuales de
`validateBehavior` pasan sin cambios.

### 4.3 Utilidad en datos
**Problema.** La función `candidates()` de `mind/behavior.engine.ts` tiene los pesos de cada
reacción en código, y `validateBehavior` los umbrales de coherencia (afectividad < 20, valentía
< 15). Incumple la regla de que el equilibrio vive en `balance.json`, y añadir una reacción
obliga a tocar tres sitios.
**Cambio.** Mover la tabla a `balance.json → personality.behavior.reactions`: por intención, una
lista de `{ behavior, base, weights, audiences, requires }`, puntuada con `weighted()` de
`mind/personality.engine.ts` (ya la usa la vida autónoma). `requires` cubre los mínimos de
dimensión y de energía. Validar en `scripts/validate-game-data.js`: reacciones del catálogo,
dimensiones válidas, toda intención con al menos una candidata para cada audiencia que admite.
Primero se trasladan los valores actuales **sin cambiar el resultado**; el ajuste viene después.
**Hecho cuando.** Un test de regresión recorre una rejilla de intención × personalidad y comprueba
que, con la tabla trasladada, `decideBehavior` devuelve lo mismo que antes del cambio.

### 4.4 Anti-repetición
**Problema.** Sin memoria de lo reciente, la reacción ganadora es siempre la misma para una
personalidad dada (ver 1.6). Y si dos candidatas puntúan casi igual, una variación mínima de una
dimensión hace saltar de una a otra de un turno al siguiente.
**Cambio.**
- Guardar las últimas reacciones en `Pet.personality.recent` (fusionando, con el bloqueo de 1.1;
  tamaño de ventana en `balance.json`).
- Penalizar la puntuación de una candidata por cada aparición en la ventana (factor en
  `balance.json`).
- Cambiar de reacción solo si la nueva supera a la anterior por un margen (en `balance.json`).
- Desempatar con PRNG sembrado con `(petId, huella de la ventana)`: mismo estado → misma reacción.
  No uses `Math.random`.
- Retirar el parche de 1.6: con variedad garantizada, la pista vuelve a enviarse siempre.
**Hecho cuando.** Tests puros: 20 turnos neutros seguidos no repiten la misma reacción más de dos
veces consecutivas; misma `Situation` → misma reacción; la métrica de repetición de 3.1 baja
respecto a la medida antes del lote (anota ambos valores en el PR).

### 4.5 Deseos
**Problema.** El Pockai nunca quiere nada por sí mismo: propone explorar solo si el dueño lo
menciona.
**Cambio.** Uno o dos deseos activos, calculados por reglas a partir de personalidad, necesidades
y relaciones, con catálogo y pesos en `balance.json → personality.wishes`. Ejemplos: `go_explore`
(curiosidad alta y días sin aventura), `see_friend` (sociable y sin ver a un amigo en etapa
`friend`), `show_find` (tiene un objeto encontrado sin entregar), `be_cuddled` (afectuoso tras
una ausencia larga), `learn_trick`.
- Con el dueño: el deseo principal entra en el prompt como tema **opcional** («si encaja, puedes
  decir que te apetece…»), dentro de la misma llamada. No en todos los turnos: cadencia en
  `balance.json`.
- En la vida autónoma: multiplica el peso de la actividad que lo satisface.
- Cumplido (hubo aventura, vio al amigo): felicidad acotada por el tope diario existente y un
  episodio. Un deseo ignorado caduca sin castigo.
**Hecho cuando.** Tests: dos personalidades opuestas generan deseos distintos con las mismas
necesidades; un deseo cumplido no vuelve a activarse hasta su enfriamiento; el prompt no contiene
el tema de deseo en turnos consecutivos.

### 4.6 Más cosas que hacer
Cada entrada nueva declara audiencia, requisitos, animación (`idle` | `happy` | `sleep`, los
sprites que existen) + emote, y efecto acotado. Todas pasan por `validateBehavior`.

**Reacciones** (se añaden a `BEHAVIORS` y, donde aplique, al enum de `express_behavior`):

| Audiencia | Reacción | Cuándo | Efecto |
|---|---|---|---|
| Dueño | `bring_gift` | Tiene un objeto encontrado sin entregar | Lo entrega (el objeto ya está en el inventario; es la presentación) y marca el episodio como contado |
| Dueño | `tell_story` | Hay episodios en `untold` | Cuenta uno; lo marca como contado |
| Dueño | `ask_about_day` | Curioso o afectuoso, primer turno del día | Ninguno |
| Dueño | `apologize` | Tras `scold`, si la relación es buena | Relación +, ver `apology` en 4.7 |
| Dueño | `perform_trick` | Sabe al menos un truco | Felicidad acotada |
| Visitante | `greet_visitor` | Sociable o etapa `acquaintance` o superior | Relación con el visitante + |
| Visitante | `hide` | Tímido o miedoso con un `stranger` | Ninguno |
| Visitante | `show_habitat` | Curioso o valiente | Ninguno |
| Visitante | `accept_treat` | El visitante ofrece un premio | Hambre acotada, relación + |
| Otro Pockai | `play_tag` | Ambos con energía | Felicidad, relación + |
| Otro Pockai | `share_food` | Afectuoso, etapa `friend` o superior | Relación + |
| Otro Pockai | `nap_together` | Ambos cansados | Energía acotada |
| Otro Pockai | `squabble` | Temperamento alto en ambos o relación negativa | Relación − (acotada) |
| Otro Pockai | `make_up` | Tras `squabble`, si alguno es afectuoso | Relación + |

**Actividades autónomas** (se añaden a `balance.json → personality.autonomy.activities`):
`practice_trick` (avanza el aprendizaje de un truco), `tidy_habitat` (solo en el hábitat; episodio,
sin efecto de juego), `visit_friend` (sustituye la elección al azar de `socialize`: el amigo se
elige por valencia y etapa). **Ojo con el determinismo:** `simulate` consume cinco tiradas del
PRNG por intervalo en un orden fijo; añade las tiradas nuevas **al final** y deja un test que
compruebe que una simulación sin las actividades nuevas habilitadas da el mismo resultado que hoy.

**Trucos.** Catálogo pequeño en `balance.json → personality.tricks` (p. ej. girar, saludar, hacerse
el dormido, traer algo), cada uno con requisito de dimensión y un número de prácticas. Se aprenden
con `practice_trick` o cuando el dueño enseña (`teach`, 4.7); se guardan en `Pet.personality.tricks`
(fusionando). No los llames «habilidades» ni «skills»: ya existen `shared/game-data/skills.json`
(combate) y las habilidades de escritorio (`ai/desktop-skills.ts`).

**Hecho cuando.** Una reacción con audiencia `owner` nunca se elige ante un visitante ni ante otro
Pockai; `bring_gift` no crea objetos (el inventario no cambia); un truco no se puede ejecutar sin
haberlo aprendido; `pnpm validate:data` rechaza una reacción sin audiencia.

### 4.7 Más cosas que entender
**Problema.** `interpretMessage` distingue 10 intenciones y ninguna trata de la vida del propio
Pockai. «¿Qué has hecho hoy?» es una `question` cualquiera, y la respuesta depende de que el
recuerdo adecuado entre en el prompt por coincidencia léxica.
**Cambio.** Intenciones nuevas, con sus filas en la tabla de 3.2 (incluidas negaciones y frases en
inglés):

| Intención | Ejemplo | Qué provoca |
|---|---|---|
| `ask_life` | «¿qué has hecho hoy?» | Garantiza episodios de `untold` en el bloque de recuerdos; reacción `tell_story` |
| `ask_friend` | «¿cómo está Brasa?» | Recupera la fila emocional y los episodios de ese sujeto (por nombre) |
| `praise` | «qué bien lo has hecho» | Relación +, candidata `show_off` o `cuddle` |
| `apology` | «perdona por lo de antes» | Repara parte de la valencia perdida por un `scold` reciente |
| `gift` | «te he traído una cosa» | Candidata `celebrate`; no concede objetos por sí misma |
| `teach` | «vamos a aprender un truco» | Suma una práctica al truco en curso (tope diario) |

La intención solo **orienta** la reacción y la memoria. Ningún efecto con valor de juego depende
de que una regex acierte sin un tope diario detrás.
**Hecho cuando.** La tabla de evaluación ampliada pasa; `ask_friend` con un nombre desconocido no
inventa recuerdos (bloque vacío para ese sujeto); 20 `teach` en un día no superan el tope.

## 8. Lote 5 — diálogo por datos, sin LLM

Los lotes 4 y 6 necesitan que el Pockai «hable» sin LLM: con visitantes, con otros Pockai y en
sus episodios. Hoy esas frases están en código y en español (`TEXTS` en `mind/autonomy.engine.ts`,
`EPISODES` en `mind/conversation.engine.ts`, `PROMPT_HINT` en `mind/behavior.engine.ts`, las notas
de `buddies/interaction-engine.service.ts`). Este lote las convierte en datos.

**Decisión de herramienta.** Un intérprete propio sobre un grafo JSON. Ink y Yarn Spinner se
descartan: las conversaciones son de dos a cuatro líneas, las condiciones leen el estado de la
mente y el servidor es NestJS; un compilador externo no aporta nada aquí. **No inventes un
lenguaje de guiones**: nodos, opciones, condiciones y asignaciones, nada más.

### 5.1 Formato
- `shared/game-data/dialogues.json` (nuevo): conversaciones con `start`, `vars` (toda variable
  usada debe estar declarada) y `nodes`. Un nodo produce **una** de estas cosas: una línea
  (`speaker` + `line`), un conjunto de opciones (`choices[]` con `text`, `to`, `if`, `set`, `cmd`),
  un salto (`next`) o el final (`end`).
- `shared/game-data/strings/es.json` y `en.json` (nuevos): ID de línea → texto. `line` y `text`
  son siempre IDs, nunca texto literal.
- Variantes por personalidad: un ID puede tener variantes por keyword de banda
  (`DLG_GREET_VISITOR@outgoing`, `@timid`); el intérprete elige la de la banda actual y cae a la
  base. Así dos Pockai dicen cosas distintas en el mismo nodo sin duplicar el grafo.
- Interpolación solo de nombres ya saneados (`{pet}`, `{friend}`, `{visitor}`, `{item}`).

### 5.2 Intérprete
Nuevo `mind/dialogue.engine.ts` (puro): `start(dialogueId, vars)`, `choose(state, index)` y un
`evaluate` de lista blanca (comparaciones, `and`/`or`/`not`, suma y resta sobre variables
declaradas; cualquier otra cosa es error de validación, no de ejecución). El intérprete no
escribe en BD ni emite eventos: devuelve el nodo siguiente, las opciones visibles y los comandos
pendientes, y el servicio decide.

### 5.3 Estado
- **Lectura:** las variables se cargan desde la `Situation` (dimensiones, valencia y etapa con el
  interlocutor, necesidades).
- **Escritura:** solo banderas de «ya visto» y contadores, guardados junto a la relación con ese
  interlocutor. Sirven para que la segunda visita no empiece igual que la primera.
- **Posición en el diálogo:** vive en el servidor (Redis, clave por visita, caducidad igual a la
  duración máxima de la visita). El cliente envía el índice de la opción, nunca el nodo.
- **Costes y efectos en la opción, no en el nodo.** Un nodo al que se puede volver no cobra ni
  premia; lo hace la transición que lleva a él, una vez. Además, todo efecto pasa por su tope
  diario en servidor.

### 5.4 Comandos
Catálogo cerrado que el grafo puede pedir y el servicio ejecuta tras validar: `behavior:<id>`
(pasa por `validateBehavior`), `feel:<delta>` (acotado), `remember:<id de plantilla>`,
`take_item:<origen>` y `wish_done:<id>`. Un comando desconocido falla en la validación de datos.

### 5.5 Validación
En `scripts/validate-game-data.js`: destinos que no existen, nodos sin salida (ni `next`, ni
opciones, ni `end`), variables no declaradas, nodos inalcanzables desde `start`, IDs de línea sin
texto en algún idioma, comandos fuera de catálogo. Más un test que recorre **todos** los caminos
de cada conversación eligiendo opciones en orden y comprueba que terminan.

### 5.6 Migración de las frases existentes
`TEXTS`, `EPISODES`, `PROMPT_HINT` y las notas de buddies pasan a IDs de línea. Los recuerdos se
guardan con el texto ya resuelto en el idioma del dueño, porque el LLM los lee tal cual. Hazlo sin
cambiar los textos en español: los tests que comparan frases deben seguir pasando.

**Hecho cuando (lote 5).** `pnpm validate:data` falla con un grafo roto (un test por cada tipo de
error de 5.5); el coste de una opción se cobra una vez aunque el nodo de destino se revisite; una
expresión con una función o propiedad no permitida se rechaza; no queda ninguna frase mostrable de
los cuatro orígenes de 5.6 en código.

## 9. Lote 6 — vida social: visitantes y otros Pockai

### 6.1 Relación por etapas
**Problema.** La memoria emocional guarda una valencia (−1..1) por sujeto y nada la usa para
cambiar el comportamiento: el quinto encuentro con Brasa es igual que el primero.
**Cambio.** Derivar una etapa de la fila emocional (`emo:user:<id>`, `emo:pet:<id>`) a partir de
valencia y familiaridad: `stranger` → `acquaintance` → `friend` → `best_friend`, y `rival` si la
valencia es negativa de forma sostenida. Umbrales en `balance.json → personality.social.stages`,
**distintos para entrar y para salir** de cada etapa, para que no oscile en el borde. La etapa
abre opciones de diálogo, reacciones (4.6) y actividades (`visit_friend`). `GET /pets/:id/mind`
la devuelve con cada relación.
**Hecho cuando.** Tests puros: una valencia que oscila alrededor de un umbral no cambia de etapa;
subir de etapa exige varios encuentros (no uno); la etapa es función pura de la fila.

### 6.2 Un dueño que visita habla con el Pockai anfitrión
**Problema.** En una visita en vivo el visitante solo deja un bocadillo de 140 caracteres para el
dueño (`VISIT_MESSAGE_MAX`). El Pockai anfitrión no reacciona a él.
**Cambio.** `POST /habitat/visit/interact` (en `presence/habitat-visit.controller.ts`), válido solo
con una `HabitatVisit` activa entre ambos. Sin cuerpo de texto: `{ choice?: number }`. Sin
`choice` empieza la conversación; con él, avanza. Responde con la línea del Pockai, su reacción
(`behavior`) y las opciones disponibles.
- **Opciones de partida:** saludar, acariciar, ofrecer un premio (un alimento del inventario del
  visitante, que se consume), jugar un momento, preguntar qué tal está.
- **Respuesta según quién es:** personalidad × etapa con ese visitante. Un tímido con un
  `stranger` se esconde (`hide`) y solo ofrece «esperar»; el mismo con un `friend` se acerca.
  Acariciar a un distante que no te conoce no funciona.
- **«¿Qué tal estás?»** se contesta con el ánimo y, como mucho, con un episodio propio no privado.
  Nunca con nada del dueño (regla de privacidad, sección 3).
- **Límites** (en `balance.json → personality.social.visitor`): interacciones por visita, efectos
  por visitante y día, y deriva de personalidad con tope reducido para terceros. Las opciones
  negativas no existen en el menú: un visitante no puede regañar a un Pockai ajeno.
- **El dueño lo ve:** `RealtimeGateway.emitToUser` al dueño con la línea y la reacción; si no
  está, queda como episodio («Ana vino y me trajo una manzana») y aparece en `untold`.
- **Ambos lados recuerdan:** el anfitrión actualiza `emo:user:<visitante>`; el Pockai del
  visitante, presente en la visita, obtiene su propia escena con el anfitrión (6.3).
**Hecho cuando.** Tests: sin visita activa → 403; ninguna respuesta contiene un hecho semántico
marcado del anfitrión; 20 interacciones de un visitante en un día no superan los topes de efecto
ni de deriva; el premio se descuenta una vez aunque la petición se repita (idempotencia); dos
personalidades opuestas dan líneas y reacciones distintas a la misma opción.

### 6.3 Pockai con Pockai: una sola «escena»
**Problema.** Hay tres caminos y ninguno comparte lógica: la visita en vivo escribe una frase fija
(`onHabitatVisit`), el encuentro autónomo otra («jugué con X, me lo pasé bien»), y los buddies del
mismo dueño usan `Math.random`, notas como «...» y **no escriben nada en la mente**.
**Cambio.** Una función pura `resolveScene(a, b, relación, ranura)` en `mind/` que usan los tres:
1. Elige el tipo de escena por utilidad con las **dos** personalidades, las necesidades de ambos y
   la etapa de la relación (reacciones de audiencia `pockai` de 4.6).
2. La resuelve con PRNG sembrado con `(pareja ordenada, ranura)`: repetir no cambia el resultado.
3. Produce un intercambio de 2–4 líneas del grafo (lote 5), un episodio para **cada** mascota
   desde su punto de vista, el cambio de valencia de cada una hacia la otra y los eventos de
   deriva.
- `InteractionEngineService` conserva su enfriamiento y su tope diario de vínculo, deja
  `Math.random` y delega la elección en la escena; `BuddiesService.trigger` emite un evento que
  `EvolutionListener` convierte en recuerdos y relación.
- `socialSweep` y `simulate` usan la escena en vez de la frase fija; respeta las reglas de
  determinismo de 4.6.
- Dos temperamentos altos pueden discutir (`squabble`) y reconciliarse en un encuentro posterior
  (`make_up`). La valencia negativa tiene suelo: los Pockai se pelean, no se odian.
**Hecho cuando.** Tests: misma pareja y ranura → misma escena en los tres caminos; cada mascota
recibe un episodio distinto del mismo encuentro; el quinto encuentro entre dos `friend` no produce
el mismo texto que el primero entre dos `stranger`; los topes de `autonomy.social.dailyCapPerPet` y de
buddies siguen cumpliéndose.

### 6.4 Rumores
**Cambio.** En una escena entre `friend` o superior, un Pockai puede contar al otro **un episodio
propio no privado**. El otro lo guarda como episodio de segunda mano («Brasa me contó que encontró
una semilla solar»), con importancia baja, y puede contárselo a su dueño (`tell_story`).
- Qué es «no privado»: episodios de vida autónoma, encuentros, aventura y combate. Nunca la capa
  semántica, nunca un episodio nacido del chat (los de `EPISODES` y los extraídos por LLM en 2.2),
  nunca nada que nombre a un tercero que no sea amigo de ambos.
- Hace falta saber el origen de cada episodio: revisa qué valores de `kind` escriben
  `AutonomyService`, `EvolutionListener`, `AdventureService` y la extracción; si no bastan para
  distinguirlos, añade una marca explícita. La lista de orígenes permitidos es una **lista
  blanca** en `balance.json`: un origen nuevo es privado hasta que alguien lo añada.
- Un rumor no se vuelve a contar a un tercer Pockai (un solo salto).
**Hecho cuando.** Tests: un episodio originado en el chat nunca aparece en la memoria de otra
mascota; un rumor recibido no se reenvía; un origen que no está en la lista no se comparte.

### 6.5 Regalos entre Pockai
**Cambio.** En una escena entre `friend` o superior, un Pockai puede dar al otro un objeto que
encontró en la vida autónoma. Cuenta dentro del tope diario de objetos encontrados
(`autonomy.itemFind.dailyCap`) del que da y tiene tope propio para el que recibe: no es una vía
nueva de conseguir objetos. Reutiliza la transferencia de `gifting/` si encaja; no dupliques
lógica de inventario. **Requiere decisión de producto** (sección 12): si no se aprueba, el regalo
es solo narrativo (episodio y relación, sin mover inventario).
**Hecho cuando.** La suma de objetos de ambos inventarios no cambia con un regalo; los topes
diarios se cumplen con escenas repetidas.

### 6.6 Con el dueño: «desde la última vez»
**Cambio.** En el primer turno tras una ausencia (`awayMinutes` sobre el umbral de
`autonomy.ownerAwayMinutes`), el bloque de recuerdos garantiza uno o dos episodios de `untold`,
priorizando por este orden: visitas recibidas, encuentros con amigos, objetos encontrados,
rumores. Se marcan como contados al inyectarse. Con `ask_life` y `ask_friend` (4.7) el dueño puede
pedirlo en cualquier momento. Coordina con `reengagement/diary.service.ts` para no contar dos
veces lo mismo por dos canales.
**Hecho cuando.** Tests: tras una ausencia con una visita recibida, el primer prompt contiene ese
episodio aunque el mensaje sea «hola»; el segundo turno no lo repite; sin ausencia no se fuerza nada.

### 6.7 Eventos sociales que faltan
**Problema.** La mente no se entera de varios hechos sociales: los cuidados que hace un amigo
(`CoopCareService.processVisit` solo emite `clan:activity`), los regalos (`gifting/` no emite
ningún evento de dominio) y las interacciones de buddies.
**Cambio.** Emitir `coop:care_received`, `gift:received` y `buddy:interacted` con los ids de
mascota y de usuario, y atenderlos en `EvolutionListener` (episodio + relación con ese sujeto +
deriva, con las claves nuevas en `balance.json → personality.evolution.events`). Como siempre: el
listener nunca rompe el flujo que emitió el evento.
**Hecho cuando.** Un test por evento: se escribe el episodio con el `subject` correcto y se mueve
la relación.

## 10. Verificación

Desde la raíz del repositorio:

- `pnpm --filter petai-backend test` — unitarios (Jest). Para acotar: añade `-- mind` o `-- ai`.
- `pnpm --filter petai-backend test:e2e` — necesita PostgreSQL y Redis (`docker-compose.yml`).
- `pnpm validate:data` — si tocas `balance.json`, `dialogues.json` o las tablas de textos.
- `pnpm --filter petai-backend build` — compila sin errores de tipos.

Comprobaciones que no son «mirar si funciona» y deben quedar como tests:

- **Determinismo:** la misma entrada da la misma reacción, la misma actividad y la misma escena.
- **Repetición:** en una secuencia guionizada de turnos, ninguna reacción sale más de dos veces
  seguidas (lote 4).
- **Grafos:** todos los caminos de todas las conversaciones terminan (lote 5).
- **Privacidad:** con un hecho semántico marcado en el anfitrión, ese texto no aparece en ninguna
  respuesta a un visitante ni en la memoria de otra mascota (lote 6).
- **Topes:** repetir cualquier interacción social no supera sus límites diarios (lote 6).

Prueba manual por lote, con el backend levantado:

- Lotes 1–3: `GET /pets/:id/mind`, enviar varios mensajes de chat (uno neutro, uno «he tenido un
  día malo», uno «te quiero») y comprobar el evento `done` (`behavior`), los recuerdos en
  `GET /pets/:id/memories` y que las dimensiones se mueven.
- Lote 4: diez mensajes neutros seguidos y comprobar que la reacción varía; «¿qué has hecho hoy?»
  tras simular una ausencia.
- Lote 6: **dos cuentas amigas**. A visita a B (`POST /habitat/visit`), recorre el menú
  (`POST /habitat/visit/interact`), y se comprueban con `GET /pets/:id/mind` los recuerdos y la
  relación en las dos mascotas; después B abre el chat y su Pockai cuenta la visita.

La spec 36 advierte de que la migración `20261118000000_pockai_mind` y el flujo completo nunca se
probaron contra una BD real. Hazlo antes de dar por bueno el lote 1 y di en el PR qué quedó sin
verificar.

## 11. Qué entregar

Por lote: un PR con los cambios, los tests nuevos, la sección correspondiente de
`docs/specs/spec-36-cerebro-pockai.md` actualizada y, en la descripción, qué se verificó y qué no.
Si un hallazgo resulta no ser cierto al escribir su test, no lo «arregles»: dilo en el PR.

Los lotes 4–6 son de backend. Si cambia un contrato HTTP o de socket, deja en el PR la lista de lo
que cada cliente (`desktop`, `web`, `mobile`) tiene que pintar: reacciones y emotes nuevos, el
menú de visita, la etapa de cada relación. Una reacción que deba animarse por socket se añade a
la vez a `PET_ACTIONS` y a `desktop/src/lib/animation/petActions.ts`.

## 12. Decisiones de producto pendientes

Confírmalas con el propietario antes de implementar el punto afectado; el resto del lote no se
bloquea.

| Punto | Decisión |
|---|---|
| 2.4 | Cadencia de extracción de memoria en el plan gratuito (gasta presupuesto de IA gestionada). |
| 3.4 | Tope diario de progresión de inteligencia. |
| 4.5 | Cada cuántos turnos puede el Pockai sacar un deseo por su cuenta. |
| 6.1 | Si existe la etapa `rival` o las relaciones entre Pockai solo pueden ser neutras o buenas. |
| 6.2 | Topes por visitante y día; si ofrecer un premio consume un alimento real del visitante. |
| 6.5 | Si los regalos entre Pockai mueven objetos reales entre inventarios o son solo narrativos. |

Ya decidido: un dueño que visita habla con el Pockai anfitrión **por menú de opciones, sin LLM y
sin texto libre**.

## Anexo A. Cerebro del escritorio y de la sala (fuera de los seis lotes)

Los lotes 1–6 son de backend. Este anexo cubre lo que no tocaban: cómo decide el Pockai en el
escritorio y en la sala isométrica, y cómo encaja con las visitas. Se hace por fases, un PR por fase.

### A.1 Fase 1 — escritorio (hecha)

El bucle de `PetView.svelte` (tiradas de `Math.random` cada 3 s, sin personalidad) se sustituye por
tres capas, las mismas de la sección 7:

| Capa | Dónde | Qué hace |
|---|---|---|
| Percibir | `desktop/src/lib/brain/deskSense.ts`, `deskSituation.ts`, `desktop/src-tauri/src/desk_sense.rs` | Pizarra con vitales, ánimo, personalidad, cursor, inactividad, ventana en primer plano, app en foco, hora y fase de Pomodoro |
| Decidir | `desktop/src/lib/brain/deskBrain.ts`, `deskBehaviors.ts`, `shared/mind` (`@pockai/mind`) | Modo superior y selector por utilidad con enfriamientos y anti-repetición |
| Actuar | `PetView.svelte` (`runCommands`), `desktop/src/lib/brain/locomotion.ts` | Ejecuta órdenes: moverse frame a frame, clips, efectos, frases, trepar, posarse, ocultarse |

- **`@pockai/mind`** (TypeScript puro): generador sembrado, dimensiones (`weighted`, `bandOf`,
  `rollBirthDims`) y `selectByUtility`. Es copia del motor del servidor; `mindParity.spec.ts` impide
  que se separen hasta que el backend importe el paquete (fase 3).
- **Pesos en datos**: `balance.json → personality.desktop`, con la forma `{ base, weights, requires }`
  de 4.3. `requires` es una lista blanca validada en `scripts/validate-game-data.js`.
- **Modos**: `away`, `asleep`, `held`, `hidden` (ventana a pantalla completa), `napping` (el usuario
  se fue), `busy` (pausa mientras suena un clip), `focus` (trabajo de un Pomodoro) y `free`.
- **Habilidades nuevas**: `cursor_play`, `presence_sense` y `flow_talent`, registradas en
  `desktop/src/lib/types/desktopSkills.ts` y en `backend/src/modules/ai/desktop-skills.ts`.
- **Privacidad**: los sentidos nuevos son eventos locales de Tauri. No entran en `deskContext`
  (`buildClientContext`) ni en `contextDigest`; el título de la ventana solo se lee con
  `context_awareness` activa. La siesta por ausencia es visual: no cambia `pet.sleeping`.
- **Interruptor**: `localStorage['petai:desk_brain'] = '0'` vuelve al bucle anterior (`legacyTick`).
  Se retira cuando la parte nativa (cursor global, inactividad, pantalla completa, seguir la ventana)
  esté comprobada en el overlay real de Windows; en macOS y Linux esos sentidos llegan vacíos.
- **En desarrollo**: `__pockaiBrain()` enseña modo y conducta; `__pockaiSense.set({ idleMs,
  foreground, appCategory, timeOfDay, cursor })` simula percepciones en el navegador.

### A.2 Fases siguientes

- **Fase 2 — sala del hábitat (hecha).** `shared/scene/src/room/petWander.ts` (puro) decide el paseo con
  `selectByUtility` y `balance.json → personality.room`: come con hambre, se baña sucio, se sienta
  cansado, juega contento, y la personalidad inclina la balanza. Va al mueble más cercano y a la celda
  de su huella a la que llegue. El mensaje `setActivity` admite un campo opcional
  `mind { dims, needs, seed }`; sin él la sala se porta de forma neutra, así que no sube
  `PROTOCOL_VERSION`. El escritorio ya lo envía (`IsoRoomView.svelte`). **Pendiente:** que Android lo
  envíe (`SceneMessages.setActivity`), que usar un mueble tenga efecto de juego en el servidor y que
  la sala admita varios actores; esto último pasa a la fase 4, que es quien lo necesita.
- **Fase 3 — lote 1 (hecho).** Los siete puntos de la sección 4, cada uno con un test que fallaba
  antes del arreglo:
  - 1.1: `MindService` bloquea la fila (`SELECT … FOR UPDATE`) en `applyExperience` y
    `patchStored`. Un turno de chat hace una sola escritura (`afterTurn` incluye `chat` y el evento
    `chat:message_sent` lleva `mindHandled`) y la vida autónoma otra (`applyExperience` admite un
    parche). El test de concurrencia con base de datos real es `backend/test/mind.e2e-spec.ts`.
  - 1.2: `clampDim` guarda 3 decimales (también en `@pockai/mind`).
  - 1.3: la retención cuenta la edad desde `updatedAt`, no desde `lastRecalledAt`. Lo que coincide
    con el mensaje se refuerza; lo demás solo anota cuándo salió, con SQL directo para no tocar
    `updatedAt`. Claves nuevas en `balance.json → personality.memory`: `minRecallScore`,
    `recentRecallMinutes` y `recentRecallPenalty`.
  - 1.4: `localTimeLabel` en `ai/personality.ts`. 1.5: incremento atómico con `updateMany`.
  - 1.6: `hintForTurn` en `mind/behavior.engine.ts` (provisional hasta 4.4).
  - 1.7: `habitat:visited` lleva `visitorPetId` y `hostPetId`. Al escribir el test salió que el
    hallazgo se quedaba corto: `resolveActivePet` ya usaba `User.activePetId` y el listener la más
    antigua, así que los recuerdos ya iban a otra mascota en cuanto el jugador elegía una activa.
  Con el lote van cuatro arreglos de fuera de la spec: `gene-reveal.service.ts` fusiona en vez de
  reescribir `personality`; mood-theater lee el rasgo derivado (`trait`) en vez de `type`, que
  nadie escribe; el recuerdo de aventura lo escribe la mente (`EvolutionListener.onAdventure`) con
  sus filtros y su capacidad; y `ELEMENTS` traduce todos los elementos de `species.json`.
- **Fase 3 — lote 2 (hecho, salvo 2.4).**
  - 2.1: `MemoryService.store` e `ingestDigest` terminan en `MindMemoryService.enforceCapacity`: el
    olvido es por retención, con la capacidad del nivel y del plan. Los topes fijos (`MAX_FACTS`,
    `MAX_SUMMARIES`) solo quedan como respaldo si la memoria por capas no está inyectada. Los
    hábitos se guardan con importancia explícita. Ojo: en el nivel «memoria» del plan gratuito la
    capa semántica admite 40 recuerdos y el tope fijo era de 50 hechos, así que una mascota que
    estuviera al límite olvidará los de menor retención en su siguiente extracción.
  - 2.2: el extractor recibe los hechos conocidos numerados (`buildExtractionInput`) y devuelve
    operaciones `add` | `update` | `delete` con importancia, más hasta dos episodios en primera
    persona. `parseExtraction` lo valida todo en servidor; los hechos como texto suelto del formato
    anterior siguen valiendo como altas. `maxTokens` sube de 400 a 600.
  - 2.3: los episodios de plantilla se guardan con clave `ep:<intención>` y `bump`: se actualiza
    el mismo recuerdo, vuelve a ser de hoy y gana importancia hasta un tope
    (`personality.memory.repeatBoost` y `repeatCap`).
  - 2.4 **no está hecho**: necesita la decisión de producto de la sección 12 (cadencia de extracción
    en el plan gratuito). La extracción sigue bloqueada por debajo de inteligencia 200.
- **Fase 3 — pendiente.** El punto 2.4 y dos hallazgos que piden decisión de diseño, no un arreglo:
  la cría no hereda personalidad (`breeding.service.ts` crea la mascota sin ella) y la vida
  autónoma aplica el estado del momento de la lectura (`sleeping`, `energy`, `sick`) a todos los
  intervalos pasados. Y que el backend importe `@pockai/mind` en lugar de su copia.
- **Fase 4 — visitas con escena compartida.** Depende de las fases 2 y 3 (1.7). El visitante entra en
  la sala del anfitrión y ambos se resuelven con `resolveScene` (6.3) y la relación por etapas (6.1).
- **Fase 5 — lotes 3 a 6 restantes**, incluido el menú del dueño visitante (6.2).
